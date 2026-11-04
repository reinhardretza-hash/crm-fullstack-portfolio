import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const leadFindFirstMock = vi.fn();
const dealCreateMock = vi.fn();
const dealFindFirstMock = vi.fn();
const dealUpdateManyMock = vi.fn();
const activityCreateMock = vi.fn();
const auditLogCreateMock = vi.fn();

const txMock = {
  lead: { findFirst: leadFindFirstMock },
  deal: {
    create: dealCreateMock,
    findFirst: dealFindFirstMock,
    updateMany: dealUpdateManyMock,
  },
  activity: { create: activityCreateMock },
  auditLog: { create: auditLogCreateMock },
};

vi.mock("@/server/rbac", () => ({
  requireUser: () => requireUserMock(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: typeof txMock) => unknown) => fn(txMock),
    deal: { findFirst: dealFindFirstMock },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { createDealAction, markDealWonAction, markDealLostAction, reopenDealAction } =
  await import("@/modules/deals/actions");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1" });
  leadFindFirstMock.mockReset().mockResolvedValue(null);
  dealCreateMock.mockReset().mockResolvedValue({ id: "deal-1" });
  dealFindFirstMock.mockReset().mockResolvedValue({ id: "deal-1" });
  dealUpdateManyMock.mockReset().mockResolvedValue({ count: 1 });
  activityCreateMock.mockReset();
  auditLogCreateMock.mockReset();
});

describe("createDealAction - Lead/Company-Konsistenz", () => {
  it("rejects when the linked lead's company contradicts the submitted company", async () => {
    leadFindFirstMock.mockResolvedValueOnce({ companyId: "other-company" });

    const result = await createDealAction(
      { error: null },
      formData({
        name: "Test Deal",
        companyId: "company-1",
        leadId: "lead-1",
        service: "WEBSITE",
        valueCents: "15000",
      }),
    );

    expect(result.error).toBe(
      "Das gewählte Unternehmen passt nicht zum Unternehmen des verknüpften Leads.",
    );
    expect(dealCreateMock).not.toHaveBeenCalled();
  });

  it("succeeds when the linked lead has no company of its own", async () => {
    leadFindFirstMock.mockResolvedValueOnce({ companyId: null });

    await expect(
      createDealAction(
        { error: null },
        formData({
          name: "Test Deal",
          companyId: "company-1",
          leadId: "lead-1",
          service: "WEBSITE",
          valueCents: "15000",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/deals/deal-1");

    expect(dealCreateMock).toHaveBeenCalled();
  });
});

describe("Deal mutations require an authenticated user", () => {
  it("createDealAction never writes when unauthenticated", async () => {
    requireUserMock.mockImplementation(() => {
      throw new Error("REDIRECT:/login");
    });

    await expect(
      createDealAction(
        { error: null },
        formData({ name: "Test", companyId: "company-1", service: "WEBSITE", valueCents: "1000" }),
      ),
    ).rejects.toThrow("REDIRECT:/login");
    expect(dealCreateMock).not.toHaveBeenCalled();
  });
});

describe("Optimistic Concurrency Control on status changes", () => {
  it("markDealWonAction returns a controlled conflict when the version no longer matches", async () => {
    dealUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const result = await markDealWonAction({ dealId: "deal-1", expectedVersion: 1 });

    expect(result).toEqual({
      success: false,
      error:
        "Der Deal wurde zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
    });
    expect(activityCreateMock).not.toHaveBeenCalled();
  });

  it("markDealLostAction returns a controlled conflict when the version no longer matches", async () => {
    dealUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const result = await markDealLostAction({ dealId: "deal-1", expectedVersion: 1 });

    expect(result.success).toBe(false);
    expect(activityCreateMock).not.toHaveBeenCalled();
  });

  it("reopenDealAction returns a controlled conflict when the version no longer matches", async () => {
    dealUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const result = await reopenDealAction({ dealId: "deal-1", expectedVersion: 1 });

    expect(result.success).toBe(false);
    expect(activityCreateMock).not.toHaveBeenCalled();
  });

  it("markDealWonAction succeeds and writes Activity+AuditLog when the version matches", async () => {
    const result = await markDealWonAction({ dealId: "deal-1", expectedVersion: 1 });

    expect(result).toEqual({ success: true, version: 2 });
    expect(activityCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "DEAL_WON" }) }),
    );
    expect(auditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "DEAL_WON" }) }),
    );
  });

  it("returns a 'not found' error for an already soft-deleted deal, not a silent no-op", async () => {
    dealFindFirstMock.mockResolvedValueOnce(null);

    const result = await markDealWonAction({ dealId: "deleted-deal", expectedVersion: 1 });

    expect(result).toEqual({ success: false, error: "Deal wurde nicht gefunden." });
    expect(dealUpdateManyMock).not.toHaveBeenCalled();
  });
});
