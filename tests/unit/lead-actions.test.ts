import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const pipelineStageFindFirstMock = vi.fn();
const companyFindFirstMock = vi.fn();
const leadCreateMock = vi.fn();
const leadFindFirstMock = vi.fn();
const activityCreateMock = vi.fn();
const auditLogCreateMock = vi.fn();
const leadScoreRuleFindManyMock = vi.fn().mockResolvedValue([]);

const txMock = {
  pipelineStage: { findFirst: pipelineStageFindFirstMock },
  company: { findFirst: companyFindFirstMock },
  lead: { create: leadCreateMock, findFirst: leadFindFirstMock },
  activity: { create: activityCreateMock },
  auditLog: { create: auditLogCreateMock },
  leadScoreRule: { findMany: leadScoreRuleFindManyMock },
};

vi.mock("@/server/rbac", () => ({
  requireUser: () => requireUserMock(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: typeof txMock) => unknown) => fn(txMock),
    lead: { findFirst: leadFindFirstMock },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { createLeadAction } = await import("@/modules/leads/actions");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1" });
  pipelineStageFindFirstMock.mockReset();
  companyFindFirstMock.mockReset().mockResolvedValue(null);
  leadCreateMock.mockReset().mockResolvedValue({ id: "lead-1" });
  activityCreateMock.mockReset();
  auditLogCreateMock.mockReset();
  leadScoreRuleFindManyMock.mockReset().mockResolvedValue([]);
});

describe("createLeadAction - stage must belong to the given pipeline", () => {
  it("rejects when the stage belongs to a DIFFERENT pipeline than the one submitted", async () => {
    pipelineStageFindFirstMock.mockResolvedValueOnce({
      id: "stage-1",
      pipelineId: "other-pipeline",
      isWonStage: false,
      isLostStage: false,
    });

    const result = await createLeadAction(
      { error: null },
      formData({
        title: "Test Lead",
        companyId: "company-1",
        pipelineId: "pipeline-1",
        stageId: "stage-1",
      }),
    );

    expect(result.error).toBe("Die gewählte Stufe gehört nicht zur gewählten Pipeline.");
    expect(leadCreateMock).not.toHaveBeenCalled();
  });

  it("rejects when the stage does not exist at all", async () => {
    pipelineStageFindFirstMock.mockResolvedValueOnce(null);

    const result = await createLeadAction(
      { error: null },
      formData({
        title: "Test Lead",
        companyId: "company-1",
        pipelineId: "pipeline-1",
        stageId: "missing-stage",
      }),
    );

    expect(result.error).toBe("Pipeline-Stufe wurde nicht gefunden.");
    expect(leadCreateMock).not.toHaveBeenCalled();
  });

  it("succeeds and derives OPEN status when the stage genuinely belongs to the pipeline", async () => {
    pipelineStageFindFirstMock.mockResolvedValueOnce({
      id: "stage-1",
      pipelineId: "pipeline-1",
      isWonStage: false,
      isLostStage: false,
    });

    await expect(
      createLeadAction(
        { error: null },
        formData({
          title: "Test Lead",
          companyId: "company-1",
          pipelineId: "pipeline-1",
          stageId: "stage-1",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/leads/lead-1");

    expect(leadCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "OPEN" }) }),
    );
  });
});

describe("Lead mutations require an authenticated user", () => {
  it("createLeadAction never writes when unauthenticated", async () => {
    requireUserMock.mockImplementation(() => {
      throw new Error("REDIRECT:/login");
    });

    await expect(
      createLeadAction(
        { error: null },
        formData({ title: "Test", companyId: "company-1", pipelineId: "p", stageId: "s" }),
      ),
    ).rejects.toThrow("REDIRECT:/login");
    expect(leadCreateMock).not.toHaveBeenCalled();
  });
});
