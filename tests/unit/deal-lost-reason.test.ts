import { describe, expect, it } from "vitest";
import { dealLostSchema } from "@/validations/deal";
import { DEAL_LOST_REASON_LABELS } from "@/lib/crm-labels";

describe("dealLostSchema - Lost Reason (kontrollierte Liste, optional)", () => {
  it("accepts marking a deal lost without any reason - reason is optional in version 1", () => {
    const result = dealLostSchema.safeParse({ dealId: "deal-1", expectedVersion: 1 });
    expect(result.success).toBe(true);
  });

  it("accepts every defined lost reason value", () => {
    for (const reason of Object.keys(DEAL_LOST_REASON_LABELS)) {
      const result = dealLostSchema.safeParse({
        dealId: "deal-1",
        expectedVersion: 1,
        lostReason: reason,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an unknown lost reason value", () => {
    const result = dealLostSchema.safeParse({
      dealId: "deal-1",
      expectedVersion: 1,
      lostReason: "NICHT_DEFINIERT",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional free-text note alongside OTHER", () => {
    const result = dealLostSchema.safeParse({
      dealId: "deal-1",
      expectedVersion: 1,
      lostReason: "OTHER",
      lostReasonNote: "Kunde hat sich für einen Mitbewerber entschieden, Details im Gespräch.",
    });
    expect(result.success).toBe(true);
  });

  it("has a German label for every lost reason value, for the UI", () => {
    for (const label of Object.values(DEAL_LOST_REASON_LABELS)) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
