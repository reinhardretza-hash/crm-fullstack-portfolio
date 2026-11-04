import { describe, expect, it } from "vitest";
import { NAV_SECTIONS } from "@/components/layout/nav-config";

function findItem(label: string) {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((i) => i.label === label);
    if (item) return item;
  }
  return undefined;
}

describe("Navigation (Phase 6: Administration sub-pages activated)", () => {
  it("Pipeline links to a real route", () => {
    expect(findItem("Pipeline")?.href).toBe("/pipeline");
  });

  it("Leads links to a real route", () => {
    expect(findItem("Leads")?.href).toBe("/leads");
  });

  it("Deals links to a real route (active since Phase 4)", () => {
    expect(findItem("Deals")?.href).toBe("/deals");
  });

  it("Follow-ups links to a real route (active since Phase 5)", () => {
    expect(findItem("Follow-ups")?.href).toBe("/follow-ups");
  });

  it("Aufgaben links to a real route (active since Phase 5)", () => {
    expect(findItem("Aufgaben")?.href).toBe("/tasks");
  });

  it("Administration sub-pages link to real routes (active since Phase 6)", () => {
    expect(findItem("Benutzer")?.href).toBe("/settings/users");
    expect(findItem("Allgemein")?.href).toBe("/settings/general");
    expect(findItem("Audit Log")?.href).toBe("/settings/audit");
  });

  it("Administration sub-pages carry the correct required permission", () => {
    expect(findItem("Benutzer")?.requiredPermission).toBe("USER_MANAGE");
    expect(findItem("Allgemein")?.requiredPermission).toBe("SETTINGS_MANAGE");
    expect(findItem("Audit Log")?.requiredPermission).toBe("AUDIT_VIEW");
  });

  it("all main modules are implemented and linked", () => {
    for (const label of ["Kontakte", "Unternehmen", "Aktivitäten", "Reports"]) {
      expect(findItem(label)?.href).toBeDefined();
    }
  });
});
