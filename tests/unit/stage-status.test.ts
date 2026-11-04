import { describe, expect, it } from "vitest";
import { deriveLeadStatusFromStage, isLeadFollowUpOverdue } from "@/modules/leads/stage-status";

describe("deriveLeadStatusFromStage", () => {
  it("returns WON for a stage flagged isWonStage", () => {
    expect(deriveLeadStatusFromStage({ isWonStage: true, isLostStage: false })).toBe("WON");
  });

  it("returns LOST for a stage flagged isLostStage", () => {
    expect(deriveLeadStatusFromStage({ isWonStage: false, isLostStage: true })).toBe("LOST");
  });

  it("returns OPEN for a normal stage", () => {
    expect(deriveLeadStatusFromStage({ isWonStage: false, isLostStage: false })).toBe("OPEN");
  });

  it("never identifies Won/Lost by stage name - only by the explicit flags", () => {
    // Eine Stufe namens "Gewonnen" mit isWonStage=false (z. B. eine
    // umbenannte oder fehlkonfigurierte Stufe) darf NICHT als WON gelten -
    // das Flag ist die einzige Quelle der Wahrheit, nie der Name.
    expect(deriveLeadStatusFromStage({ isWonStage: false, isLostStage: false })).toBe("OPEN");
  });
});

describe("isLeadFollowUpOverdue", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("is true for an OPEN lead with a past follow-up date", () => {
    const lead = { status: "OPEN" as const, nextFollowUpAt: new Date("2026-06-14T12:00:00Z") };
    expect(isLeadFollowUpOverdue(lead, now)).toBe(true);
  });

  it("is false for an OPEN lead with a future follow-up date", () => {
    const lead = { status: "OPEN" as const, nextFollowUpAt: new Date("2026-06-16T12:00:00Z") };
    expect(isLeadFollowUpOverdue(lead, now)).toBe(false);
  });

  it("is false when no follow-up date is set", () => {
    const lead = { status: "OPEN" as const, nextFollowUpAt: null };
    expect(isLeadFollowUpOverdue(lead, now)).toBe(false);
  });

  it("is false for a WON lead even with a past follow-up date (the opportunity is already decided)", () => {
    const lead = { status: "WON" as const, nextFollowUpAt: new Date("2026-06-14T12:00:00Z") };
    expect(isLeadFollowUpOverdue(lead, now)).toBe(false);
  });

  it("is false for a LOST lead even with a past follow-up date", () => {
    const lead = { status: "LOST" as const, nextFollowUpAt: new Date("2026-06-14T12:00:00Z") };
    expect(isLeadFollowUpOverdue(lead, now)).toBe(false);
  });

  it("is false for an ARCHIVED lead even with a past follow-up date", () => {
    const lead = { status: "ARCHIVED" as const, nextFollowUpAt: new Date("2026-06-14T12:00:00Z") };
    expect(isLeadFollowUpOverdue(lead, now)).toBe(false);
  });
});
