import { describe, expect, it } from "vitest";
import { assertLeadCompanyConsistency } from "@/modules/deals/validation";

describe("assertLeadCompanyConsistency (Lead -> Deal Konsistenz, siehe Vorgabe Punkt 9)", () => {
  it("does nothing when there is no lead at all (Deal ohne Lead ist zulässig)", () => {
    expect(() => assertLeadCompanyConsistency(null, "company-1")).not.toThrow();
  });

  it("does nothing when the lead has no company of its own", () => {
    expect(() => assertLeadCompanyConsistency({ companyId: null }, "company-1")).not.toThrow();
  });

  it("does nothing when the lead's company matches the deal's company", () => {
    expect(() =>
      assertLeadCompanyConsistency({ companyId: "company-1" }, "company-1"),
    ).not.toThrow();
  });

  it("throws when the lead's company contradicts the deal's company", () => {
    expect(() => assertLeadCompanyConsistency({ companyId: "company-1" }, "company-2")).toThrow(
      /nicht zum Unternehmen des verknüpften Leads/,
    );
  });
});
