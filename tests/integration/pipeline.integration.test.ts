import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPipelineBoard } from "@/modules/leads/queries";

describe("Pipeline stage ordering (real PostgreSQL)", () => {
  it("returns stages in position order from getPipelineBoard, regardless of insertion order", async () => {
    const pipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "Testpipeline",
        stages: {
          create: [
            { id: createId(), name: "Dritte", position: 3 },
            { id: createId(), name: "Erste", position: 1 },
            { id: createId(), name: "Zweite", position: 2 },
          ],
        },
      },
    });

    const { pipeline: board } = await getPipelineBoard(pipeline.id);

    expect(board?.stages.map((s) => s.name)).toEqual(["Erste", "Zweite", "Dritte"]);
  });

  it("enforces unique positions within a pipeline at the database level", async () => {
    const pipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "Testpipeline",
        stages: { create: [{ id: createId(), name: "Stufe 1", position: 1 }] },
      },
    });

    await expect(
      prisma.pipelineStage.create({
        data: { id: createId(), pipelineId: pipeline.id, name: "Duplikat", position: 1 },
      }),
    ).rejects.toThrow();
  });
});

describe("Won/Lost stage invariants (real PostgreSQL)", () => {
  it("rejects a stage that is both Won and Lost at the same time", async () => {
    const pipeline = await prisma.pipeline.create({
      data: { id: createId(), name: "Testpipeline" },
    });

    await expect(
      prisma.pipelineStage.create({
        data: {
          id: createId(),
          pipelineId: pipeline.id,
          name: "Ungültig",
          position: 1,
          isWonStage: true,
          isLostStage: true,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a second Won stage within the same pipeline", async () => {
    const pipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "Testpipeline",
        stages: { create: [{ id: createId(), name: "Gewonnen", position: 1, isWonStage: true }] },
      },
    });

    await expect(
      prisma.pipelineStage.create({
        data: {
          id: createId(),
          pipelineId: pipeline.id,
          name: "Auch gewonnen",
          position: 2,
          isWonStage: true,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a second Lost stage within the same pipeline", async () => {
    const pipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "Testpipeline",
        stages: { create: [{ id: createId(), name: "Verloren", position: 1, isLostStage: true }] },
      },
    });

    await expect(
      prisma.pipelineStage.create({
        data: {
          id: createId(),
          pipelineId: pipeline.id,
          name: "Auch verloren",
          position: 2,
          isLostStage: true,
        },
      }),
    ).rejects.toThrow();
  });

  it("allows different pipelines to each have their own Won and Lost stage", async () => {
    await expect(
      Promise.all([
        prisma.pipeline.create({
          data: {
            id: createId(),
            name: "Pipeline A",
            stages: {
              create: [
                { id: createId(), name: "Gewonnen A", position: 1, isWonStage: true },
                { id: createId(), name: "Verloren A", position: 2, isLostStage: true },
              ],
            },
          },
        }),
        prisma.pipeline.create({
          data: {
            id: createId(),
            name: "Pipeline B",
            stages: {
              create: [
                { id: createId(), name: "Gewonnen B", position: 1, isWonStage: true },
                { id: createId(), name: "Verloren B", position: 2, isLostStage: true },
              ],
            },
          },
        }),
      ]),
    ).resolves.toBeDefined();
  });
});

describe("Exactly one default pipeline (real PostgreSQL partial unique index)", () => {
  it("allows exactly one pipeline with isDefault=true", async () => {
    await prisma.pipeline.create({ data: { id: createId(), name: "Pipeline A", isDefault: true } });

    await expect(
      prisma.pipeline.create({ data: { id: createId(), name: "Pipeline B", isDefault: true } }),
    ).rejects.toThrow();
  });

  it("allows multiple non-default pipelines", async () => {
    await prisma.pipeline.create({
      data: { id: createId(), name: "Pipeline A", isDefault: false },
    });
    await expect(
      prisma.pipeline.create({ data: { id: createId(), name: "Pipeline B", isDefault: false } }),
    ).resolves.toBeDefined();
  });
});

describe("Pipeline aggregates (real PostgreSQL, no fake forecasting)", () => {
  it("computes open-leads-count and total expected value only from real OPEN leads in the pipeline", async () => {
    const pipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "Testpipeline",
        stages: {
          create: [
            { id: createId(), name: "Offen", position: 1 },
            { id: createId(), name: "Gewonnen", position: 2, isWonStage: true },
          ],
        },
      },
      include: { stages: true },
    });
    const [openStage, wonStage] = pipeline.stages;
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });

    await prisma.lead.create({
      data: {
        id: createId(),
        title: "Offener Lead",
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: openStage.id,
        status: "OPEN",
        expectedValueCents: 1_000_00,
      },
    });
    await prisma.lead.create({
      data: {
        id: createId(),
        title: "Gewonnener Lead",
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: wonStage.id,
        status: "WON",
        expectedValueCents: 5_000_00,
      },
    });

    const { leads } = await getPipelineBoard(pipeline.id);
    const openLeads = leads.filter((lead) => lead.status === "OPEN");
    const openValueCents = openLeads.reduce((sum, lead) => sum + (lead.expectedValueCents ?? 0), 0);

    // Nur der offene Lead zählt in die "offene Leads"-Kennzahl und den
    // erwarteten Gesamtwert - der gewonnene Lead erscheint zwar weiterhin
    // auf dem Board (in seiner Spalte), aber nicht in dieser Aggregation.
    expect(openLeads).toHaveLength(1);
    expect(openValueCents).toBe(1_000_00);
    // Das Board selbst zeigt trotzdem beide Leads (für die Gewonnen-Spalte).
    expect(leads).toHaveLength(2);
  });
});
