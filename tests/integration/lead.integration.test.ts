import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

let testUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => testUser,
}));

// revalidatePath() braucht einen echten Next.js-Request-Kontext
// (AsyncLocalStorage), den es außerhalb eines laufenden Servers nicht gibt -
// in der echten Anwendung funktioniert es (manuell im Browser gegen den
// echten Dev-Server verifiziert, siehe Schritt-4/5-Berichte). Hier nur
// Rauschen für die eigentlich zu testende Transaktions-/DB-Logik.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { createLeadAction, updateLeadAction, deleteLeadAction, moveLeadStageAction } =
  await import("@/modules/leads/actions");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function seedPipeline() {
  const pipeline = await prisma.pipeline.create({
    data: {
      id: createId(),
      name: "Testpipeline",
      isDefault: true,
      stages: {
        create: [
          { id: createId(), name: "Neuer Kontakt", position: 1 },
          { id: createId(), name: "Gespräch läuft", position: 2 },
          { id: createId(), name: "Gewonnen", position: 3, isWonStage: true },
          { id: createId(), name: "Verloren", position: 4, isLostStage: true },
        ],
      },
    },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  return pipeline;
}

beforeEach(async () => {
  testUser = await prisma.user.create({
    data: {
      id: createId(),
      email: `${createId()}@example.com`,
      passwordHash: "irrelevant",
      firstName: "Test",
      lastName: "User",
    },
  });
});

describe("Lead creation (real PostgreSQL transaction)", () => {
  it("creates a lead with company, pipeline, stage, computes score and OPEN status", async () => {
    const pipeline = await seedPipeline();
    const company = await prisma.company.create({
      data: { id: createId(), name: "Acme GmbH", country: "Deutschland", companySize: "SMALL" },
    });

    try {
      await createLeadAction(
        { error: null },
        formData({
          title: "Digitalisierung interner Prozesse",
          companyId: company.id,
          pipelineId: pipeline.id,
          stageId: pipeline.stages[0].id,
          source: "LINKEDIN",
          interest: "WEBSITE",
          expectedValueCents: "15000",
        }),
      );
    } catch {
      // redirect() wirft einen Next.js-Kontrollfluss-Fehler - erwartet, ignorieren.
    }

    const lead = await prisma.lead.findFirstOrThrow({
      where: { title: "Digitalisierung interner Prozesse" },
    });
    const leadId = lead.id;
    expect(lead.status).toBe("OPEN");
    expect(lead.score).toBe(60); // LinkedIn(10) + Bedarf(30) + DACH(10) + KMU(10)
    expect(lead.expectedValueCents).toBe(1_500_000);

    const activity = await prisma.activity.findFirst({ where: { leadId } });
    expect(activity?.type).toBe("LEAD_CREATED");
    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: leadId, entityType: "Lead" },
    });
    expect(auditLog?.action).toBe("LEAD_CREATED");
  });

  it("rejects a lead whose stage does not belong to the given pipeline", async () => {
    const pipeline = await seedPipeline();
    const otherPipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "Andere Pipeline",
        stages: { create: [{ id: createId(), name: "Stufe A", position: 1 }] },
      },
      include: { stages: true },
    });
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });

    const result = await createLeadAction(
      { error: null },
      formData({
        title: "Fehlerhafter Lead",
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: otherPipeline.stages[0].id,
      }),
    );

    expect(result.error).toBe("Die gewählte Stufe gehört nicht zur gewählten Pipeline.");
    const count = await prisma.lead.count({ where: { title: "Fehlerhafter Lead" } });
    expect(count).toBe(0);
  });
});

describe("Lead editing and soft delete (real PostgreSQL)", () => {
  it("updates a lead and keeps company/contact/tag relations intact", async () => {
    const pipeline = await seedPipeline();
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    const contact = await prisma.contact.create({
      data: { id: createId(), firstName: "Max", companyId: company.id },
    });

    try {
      await createLeadAction(
        { error: null },
        formData({
          title: "Lead A",
          companyId: company.id,
          pipelineId: pipeline.id,
          stageId: pipeline.stages[0].id,
        }),
      );
    } catch {
      // redirect - erwartet.
    }
    const created = await prisma.lead.findFirstOrThrow({ where: { title: "Lead A" } });
    const leadId = created.id;

    try {
      await updateLeadAction(
        leadId,
        { error: null },
        formData({
          title: "Lead A (aktualisiert)",
          expectedVersion: String(created.version),
          companyId: company.id,
          contactId: contact.id,
          pipelineId: pipeline.id,
          stageId: pipeline.stages[1].id,
        }),
      );
    } catch {
      // redirect - ignore
    }

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(updated.title).toBe("Lead A (aktualisiert)");
    expect(updated.companyId).toBe(company.id);
    expect(updated.contactId).toBe(contact.id);
    expect(updated.stageId).toBe(pipeline.stages[1].id);

    // Relations bleiben unabhängig intakt.
    const companyStillExists = await prisma.company.findUnique({ where: { id: company.id } });
    const contactStillExists = await prisma.contact.findUnique({ where: { id: contact.id } });
    expect(companyStillExists).not.toBeNull();
    expect(contactStillExists).not.toBeNull();
  });

  it("soft-deletes a lead: deletedAt set, removed from normal list, Activity + AuditLog written", async () => {
    const pipeline = await seedPipeline();
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });

    try {
      await createLeadAction(
        { error: null },
        formData({
          title: "Zu löschender Lead",
          companyId: company.id,
          pipelineId: pipeline.id,
          stageId: pipeline.stages[0].id,
        }),
      );
    } catch {
      // redirect - erwartet.
    }
    const created = await prisma.lead.findFirstOrThrow({ where: { title: "Zu löschender Lead" } });
    const leadId = created.id;

    await deleteLeadAction(leadId);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead?.deletedAt).not.toBeNull();

    const { listLeads } = await import("@/modules/leads/queries");
    const { leadFiltersSchema } = await import("@/validations/lead");
    const { leads } = await listLeads(leadFiltersSchema.parse({}), { page: 1, pageSize: 25 });
    expect(leads.find((l) => l.id === leadId)).toBeUndefined();

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: leadId, action: "LEAD_DELETED" },
    });
    expect(auditLog).not.toBeNull();
  });
});

describe("Stage move: status transitions, Activity and AuditLog (real PostgreSQL)", () => {
  async function createTestLead(pipeline: Awaited<ReturnType<typeof seedPipeline>>) {
    const title = `Transition Lead ${createId()}`;
    const company = await prisma.company.create({
      data: { id: createId(), name: `Company-${createId()}` },
    });
    try {
      await createLeadAction(
        { error: null },
        formData({
          title,
          companyId: company.id,
          pipelineId: pipeline.id,
          stageId: pipeline.stages[0].id,
        }),
      );
    } catch {
      // redirect - erwartet.
    }
    return prisma.lead.findFirstOrThrow({ where: { title } });
  }

  it("OPEN -> WON sets status=WON and writes LEAD_STAGE_CHANGED + LEAD_WON", async () => {
    const pipeline = await seedPipeline();
    const lead = await createTestLead(pipeline);
    const wonStage = pipeline.stages.find((s) => s.isWonStage)!;

    const result = await moveLeadStageAction({
      leadId: lead.id,
      toStageId: wonStage.id,
      expectedVersion: lead.version,
    });
    expect(result.success).toBe(true);

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.status).toBe("WON");

    const activityTypes = (
      await prisma.activity.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } })
    ).map((a) => a.type);
    expect(activityTypes).toEqual(["LEAD_CREATED", "LEAD_STAGE_CHANGED", "LEAD_WON"]);

    const auditActions = (
      await prisma.auditLog.findMany({
        where: { entityId: lead.id },
        orderBy: { createdAt: "asc" },
      })
    ).map((a) => a.action);
    expect(auditActions).toEqual(["LEAD_CREATED", "LEAD_STAGE_CHANGED", "LEAD_WON"]);
  });

  it("WON -> OPEN (back to a normal stage) resets status to OPEN - no one-way street", async () => {
    const pipeline = await seedPipeline();
    const lead = await createTestLead(pipeline);
    const wonStage = pipeline.stages.find((s) => s.isWonStage)!;
    const normalStage = pipeline.stages[1];

    const first = await moveLeadStageAction({
      leadId: lead.id,
      toStageId: wonStage.id,
      expectedVersion: lead.version,
    });
    expect(first.success).toBe(true);
    if (!first.success) throw new Error("unreachable");

    const second = await moveLeadStageAction({
      leadId: lead.id,
      toStageId: normalStage.id,
      expectedVersion: first.version,
    });
    expect(second.success).toBe(true);

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.status).toBe("OPEN");
  });

  it("OPEN -> LOST sets status=LOST and writes LEAD_LOST", async () => {
    const pipeline = await seedPipeline();
    const lead = await createTestLead(pipeline);
    const lostStage = pipeline.stages.find((s) => s.isLostStage)!;

    const result = await moveLeadStageAction({
      leadId: lead.id,
      toStageId: lostStage.id,
      expectedVersion: lead.version,
    });
    expect(result.success).toBe(true);

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.status).toBe("LOST");

    const wonOrLost = await prisma.activity.findFirst({
      where: { leadId: lead.id, type: "LEAD_LOST" },
    });
    expect(wonOrLost).not.toBeNull();
  });

  it("LOST -> OPEN resets status to OPEN", async () => {
    const pipeline = await seedPipeline();
    const lead = await createTestLead(pipeline);
    const lostStage = pipeline.stages.find((s) => s.isLostStage)!;
    const normalStage = pipeline.stages[1];

    const first = await moveLeadStageAction({
      leadId: lead.id,
      toStageId: lostStage.id,
      expectedVersion: lead.version,
    });
    if (!first.success) throw new Error("unreachable");

    const second = await moveLeadStageAction({
      leadId: lead.id,
      toStageId: normalStage.id,
      expectedVersion: first.version,
    });
    expect(second.success).toBe(true);

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.status).toBe("OPEN");
  });

  it("rejects a stage move to a stage from a different pipeline", async () => {
    const pipeline = await seedPipeline();
    const lead = await createTestLead(pipeline);
    const otherPipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "Fremde Pipeline",
        stages: { create: [{ id: createId(), name: "Fremd", position: 1 }] },
      },
      include: { stages: true },
    });

    const result = await moveLeadStageAction({
      leadId: lead.id,
      toStageId: otherPipeline.stages[0].id,
      expectedVersion: lead.version,
    });

    expect(result.success).toBe(false);
    const unchanged = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(unchanged.stageId).toBe(pipeline.stages[0].id);
  });

  it("rejects a stage move to a non-existing stage", async () => {
    const pipeline = await seedPipeline();
    const lead = await createTestLead(pipeline);

    const result = await moveLeadStageAction({
      leadId: lead.id,
      toStageId: "does-not-exist",
      expectedVersion: lead.version,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Pipeline-Stufe wurde nicht gefunden.");
  });

  it("rejects a stage move for a soft-deleted lead", async () => {
    const pipeline = await seedPipeline();
    const lead = await createTestLead(pipeline);
    const targetStage = pipeline.stages[1];
    await prisma.lead.update({ where: { id: lead.id }, data: { deletedAt: new Date() } });

    const result = await moveLeadStageAction({
      leadId: lead.id,
      toStageId: targetStage.id,
      expectedVersion: lead.version,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Lead wurde nicht gefunden.");
  });

  it("rejects a stage move within a pipeline that has been deactivated", async () => {
    const pipeline = await seedPipeline();
    const lead = await createTestLead(pipeline);
    const targetStage = pipeline.stages[1];
    await prisma.pipeline.update({ where: { id: pipeline.id }, data: { isActive: false } });

    const result = await moveLeadStageAction({
      leadId: lead.id,
      toStageId: targetStage.id,
      expectedVersion: lead.version,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "Diese Pipeline ist deaktiviert und kann nicht mehr bearbeitet werden.",
      );
    }
    const unchanged = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(unchanged.stageId).toBe(pipeline.stages[0].id);
  });
});
