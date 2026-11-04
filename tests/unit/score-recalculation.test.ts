import { beforeEach, describe, expect, it, vi } from "vitest";

const leadFindManyMock = vi.fn();
const leadUpdateMock = vi.fn();
const transactionMock = vi.fn(async (operations: unknown[]) => Promise.all(operations));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: {
      findMany: (...args: unknown[]) => leadFindManyMock(...args),
      update: (...args: unknown[]) => leadUpdateMock(...args),
    },
    $transaction: (operations: unknown[]) => transactionMock(operations),
  },
}));

const { recalculateAllLeadScores } = await import("@/modules/leads/score-rules");

const RULES = [{ rule: "LINKEDIN_SOURCE" as const, points: 10, enabled: true }];

beforeEach(() => {
  leadFindManyMock.mockReset();
  leadUpdateMock.mockReset();
  transactionMock.mockClear();
});

describe("recalculateAllLeadScores", () => {
  it("updates only leads whose recalculated score actually changed", async () => {
    leadFindManyMock.mockResolvedValueOnce([
      { id: "lead-1", source: "LINKEDIN", interest: null, score: 0, company: null },
      { id: "lead-2", source: "LINKEDIN", interest: null, score: 10, company: null },
    ]);

    const count = await recalculateAllLeadScores(RULES);

    expect(count).toBe(2);
    expect(leadUpdateMock).toHaveBeenCalledTimes(1);
    expect(leadUpdateMock).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { score: 10 },
    });
  });

  it("writes nothing when no scores changed (no unnecessary transaction)", async () => {
    leadFindManyMock.mockResolvedValueOnce([
      { id: "lead-1", source: "LINKEDIN", interest: null, score: 10, company: null },
    ]);

    await recalculateAllLeadScores(RULES);

    expect(leadUpdateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("returns 0 and never crashes when there are no active leads at all", async () => {
    leadFindManyMock.mockResolvedValueOnce([]);

    const count = await recalculateAllLeadScores(RULES);

    expect(count).toBe(0);
    expect(leadUpdateMock).not.toHaveBeenCalled();
  });

  it("only ever queries deletedAt: null leads (soft-deleted leads are not recalculated)", async () => {
    leadFindManyMock.mockResolvedValueOnce([]);

    await recalculateAllLeadScores(RULES);

    expect(leadFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null } }),
    );
  });
});
