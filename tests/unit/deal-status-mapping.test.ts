import { describe, expect, it } from "vitest";
import { dealLostPatch, dealReopenPatch, dealWonPatch } from "@/modules/deals/status";

describe("dealWonPatch", () => {
  it("sets status=WON, closedAt=now, and clears any previous lost reason", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    const patch = dealWonPatch(now);

    expect(patch).toEqual({ status: "WON", closedAt: now, lostReason: null, lostReasonNote: null });
  });
});

describe("dealLostPatch", () => {
  it("sets status=LOST, closedAt=now, and carries the given reason/note", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    const patch = dealLostPatch({ lostReason: "PRICE", lostReasonNote: "Zu teuer" }, now);

    expect(patch).toEqual({
      status: "LOST",
      closedAt: now,
      lostReason: "PRICE",
      lostReasonNote: "Zu teuer",
    });
  });

  it("allows marking a deal lost without any reason (optional in version 1)", () => {
    const patch = dealLostPatch({}, new Date("2026-06-15T10:00:00Z"));

    expect(patch.lostReason).toBeNull();
    expect(patch.lostReasonNote).toBeNull();
  });
});

describe("dealReopenPatch - Reopen-Verhalten", () => {
  it("resets status to OPEN and clears closedAt", () => {
    const patch = dealReopenPatch();

    expect(patch.status).toBe("OPEN");
    expect(patch.closedAt).toBeNull();
  });

  // Bewusste Entscheidung (siehe schema.prisma Deal-Model): lostReason wird
  // beim Reopen gelöscht, NICHT erhalten - ein wiedereröffneter Deal hat
  // keinen aktuellen Verlustgrund mehr, der alte Grund bliebe sonst
  // irreführend stehen. Die Historie bleibt über die Activity/AuditLog-
  // Metadata des ursprünglichen DEAL_LOST-Eintrags nachvollziehbar.
  it("clears lostReason/lostReasonNote on reopen (deliberately not preserved)", () => {
    const patch = dealReopenPatch();

    expect(patch.lostReason).toBeNull();
    expect(patch.lostReasonNote).toBeNull();
  });
});
