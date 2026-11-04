import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

let testUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => testUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { setLeadFollowUpAction } = await import("@/modules/leads/actions");
const { listFollowUps } = await import("@/modules/leads/queries");
const { followUpFiltersSchema } = await import("@/validations/lead");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function seedLead(status: "OPEN" | "WON" | "LOST", nextFollowUpAt: Date | null) {
  const company = await prisma.company.create({
    data: { id: createId(), name: `Company-${createId()}` },
  });
  const pipeline = await prisma.pipeline.create({
    data: {
      id: createId(),
      name: "Testpipeline",
      stages: {
        create: [
          { id: createId(), name: "Offen", position: 1 },
          { id: createId(), name: "Gewonnen", position: 2, isWonStage: true },
          { id: createId(), name: "Verloren", position: 3, isLostStage: true },
        ],
      },
    },
    include: { stages: true },
  });
  const stage =
    status === "WON"
      ? pipeline.stages.find((s) => s.isWonStage)!
      : status === "LOST"
        ? pipeline.stages.find((s) => s.isLostStage)!
        : pipeline.stages[0];

  return prisma.lead.create({
    data: {
      id: createId(),
      title: `Lead-${createId()}`,
      companyId: company.id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      status,
      nextFollowUpAt,
    },
  });
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

describe("Follow-up overview (real PostgreSQL)", () => {
  it("shows an OPEN lead with a past follow-up date as overdue", async () => {
    await seedLead("OPEN", new Date("2020-01-01T00:00:00Z"));

    const leads = await listFollowUps(followUpFiltersSchema.parse({ view: "overdue" }));
    expect(leads).toHaveLength(1);
  });

  it("shows an OPEN lead with today's follow-up date in the 'today' view", async () => {
    // Date only: PostgreSQL/network timers remain real. +3h crosses midnight
    // on evening test runs; a fixed Berlin morning makes this fixture stable.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T08:00:00Z"));
    try {
      await seedLead("OPEN", new Date(Date.now() + 1000 * 60 * 60 * 3));
      const leads = await listFollowUps(followUpFiltersSchema.parse({ view: "today" }));
      expect(leads).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows an OPEN lead with a future follow-up date in the 'upcoming' view", async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await seedLead("OPEN", future);

    const leads = await listFollowUps(followUpFiltersSchema.parse({ view: "upcoming" }));
    expect(leads).toHaveLength(1);
  });

  it("NEVER shows a WON lead, even with an overdue follow-up date", async () => {
    await seedLead("WON", new Date("2020-01-01T00:00:00Z"));

    const leads = await listFollowUps(followUpFiltersSchema.parse({ view: "all" }));
    expect(leads).toHaveLength(0);
  });

  it("NEVER shows a LOST lead, even with an overdue follow-up date", async () => {
    await seedLead("LOST", new Date("2020-01-01T00:00:00Z"));

    const leads = await listFollowUps(followUpFiltersSchema.parse({ view: "all" }));
    expect(leads).toHaveLength(0);
  });

  it("sorts oldest overdue first", async () => {
    const olderLead = await seedLead("OPEN", new Date("2020-01-01T00:00:00Z"));
    await seedLead("OPEN", new Date("2024-01-01T00:00:00Z"));

    const leads = await listFollowUps(followUpFiltersSchema.parse({ view: "all" }));
    expect(leads[0].id).toBe(olderLead.id);
  });
});

describe("Changing a follow-up date writes Activity with old/new metadata (real PostgreSQL)", () => {
  it("logs LEAD_FOLLOW_UP_CHANGED with oldFollowUpAt/newFollowUpAt", async () => {
    const lead = await seedLead("OPEN", new Date("2026-06-01T00:00:00Z"));

    await setLeadFollowUpAction(
      lead.id,
      { error: null },
      formData({ nextFollowUpAt: "2026-10-05T10:00" }),
    );

    const activity = await prisma.activity.findFirst({
      where: { leadId: lead.id, type: "LEAD_FOLLOW_UP_CHANGED" },
    });
    expect(activity).not.toBeNull();
    const metadata = activity?.metadata as {
      oldFollowUpAt: string | null;
      newFollowUpAt: string | null;
    };
    expect(metadata.oldFollowUpAt).toBe(new Date("2026-06-01T00:00:00Z").toISOString());
    expect(new Date(metadata.newFollowUpAt!).toISOString()).toBe(
      new Date("2026-10-05T10:00").toISOString(),
    );
  });

  it("records a null oldFollowUpAt when the lead had none before", async () => {
    const lead = await seedLead("OPEN", null);

    await setLeadFollowUpAction(
      lead.id,
      { error: null },
      formData({ nextFollowUpAt: "2026-10-05T10:00" }),
    );

    const activity = await prisma.activity.findFirst({
      where: { leadId: lead.id, type: "LEAD_FOLLOW_UP_CHANGED" },
    });
    const metadata = activity?.metadata as { oldFollowUpAt: string | null };
    expect(metadata.oldFollowUpAt).toBeNull();
  });
});
