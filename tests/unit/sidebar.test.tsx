// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PERMISSIONS, type Permission } from "@/server/permissions";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

const { Sidebar } = await import("@/components/layout/sidebar");

function renderSidebar(canManageAdministration: boolean, permissions: Permission[] = []) {
  render(
    <Sidebar
      canManageAdministration={canManageAdministration}
      permissions={permissions}
      isCollapsed={false}
      isMobileNavOpen={false}
      onCloseMobileNav={() => {}}
    />,
  );
}

describe("Sidebar navigation", () => {
  it("renders the implemented Dashboard entry as a real link", () => {
    renderSidebar(false);

    const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboardLink.getAttribute("href")).toBe("/dashboard");
  });

  it("renders the Reports entry as a real link (active since Phase 13)", () => {
    renderSidebar(false);

    const link = screen.getByRole("link", { name: /^Reports/ });
    expect(link.getAttribute("href")).toBe("/reports");
    expect(screen.queryByRole("button", { name: /noch nicht verfügbar/ })).toBeNull();
  });

  it("renders the Aktivitäten entry as a real link (active since Phase 12)", () => {
    renderSidebar(false);

    const link = screen.getByRole("link", { name: /^Aktivitäten/ });
    expect(link.getAttribute("href")).toBe("/activities");
  });

  it("renders the Deals entry as a real link (active since Phase 4)", () => {
    renderSidebar(false);

    const dealsLink = screen.getByRole("link", { name: "Deals" });
    expect(dealsLink.getAttribute("href")).toBe("/deals");
  });

  it("renders the Aufgaben and Follow-ups entries as real links (active since Phase 5)", () => {
    renderSidebar(false);

    expect(screen.getByRole("link", { name: "Aufgaben" }).getAttribute("href")).toBe("/tasks");
    expect(screen.getByRole("link", { name: "Follow-ups" }).getAttribute("href")).toBe(
      "/follow-ups",
    );
  });

  it("hides the Administration section entirely for a user without any admin permission", () => {
    renderSidebar(false, []);

    expect(screen.queryByText("Administration")).toBeNull();
    expect(screen.queryByText("Benutzer")).toBeNull();
    expect(screen.queryByText("Audit Log")).toBeNull();
  });

  function adminLinkHrefs() {
    return screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/settings/"))
      .map((link) => link.getAttribute("href"));
  }

  it("shows every Administration sub-item for OWNER (all permissions)", () => {
    renderSidebar(true, [...PERMISSIONS]);

    expect(screen.getByText("Administration")).toBeTruthy();
    expect(adminLinkHrefs().sort()).toEqual(
      [
        "/settings/audit",
        "/settings/general",
        "/settings/lead-scoring",
        "/settings/pipeline",
        "/settings/reminders",
        "/settings/tags",
        "/settings/users",
      ].sort(),
    );
  });

  it("shows only the permitted Administration sub-items for ADMIN (no USER_MANAGE/SETTINGS_MANAGE/AUDIT_VIEW)", () => {
    renderSidebar(true, ["PIPELINE_MANAGE", "TAG_MANAGE", "LEAD_SCORING_MANAGE"]);

    expect(screen.getByText("Administration")).toBeTruthy();
    expect(adminLinkHrefs().sort()).toEqual(
      ["/settings/lead-scoring", "/settings/pipeline", "/settings/tags"].sort(),
    );

    expect(screen.queryByText("Benutzer")).toBeNull();
    expect(screen.queryByText("Allgemein")).toBeNull();
    expect(screen.queryByText("Audit Log")).toBeNull();
  });
});

describe("Mobile drawer scrolling", () => {
  it("renders all nav items inside a scrollable container within a dvh-high drawer", () => {
    render(
      <Sidebar
        canManageAdministration={true}
        permissions={[...PERMISSIONS]}
        isCollapsed={false}
        isMobileNavOpen={true}
        onCloseMobileNav={() => {}}
      />,
    );
    const drawer = screen.getByRole("dialog");
    expect(drawer.className).toContain("h-dvh");
    expect(drawer.className).toContain("flex-col");
    const scroll = screen.getByTestId("mobile-nav-scroll");
    expect(scroll.className).toContain("overflow-y-auto");
    expect(scroll.className).toContain("min-h-0");
    expect(scroll.className).toContain("flex-1");
    // Header (mit Schließen-Button) liegt außerhalb des Scrollbereichs.
    expect(scroll.contains(screen.getByRole("button", { name: "Navigation schließen" }))).toBe(
      false,
    );
    // Alle Einträge (inkl. Reports, Aktivitäten, Einstellungen) im Scrollbereich.
    for (const name of [/^Reports/, /^Aktivitäten/, /^Allgemein/]) {
      expect(scroll.contains(screen.getByRole("link", { name }))).toBe(true);
    }
  });
});
