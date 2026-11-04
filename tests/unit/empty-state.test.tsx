// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/ui/empty-state";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="Keine Aufgaben für heute." />);
    expect(screen.getByText("Keine Aufgaben für heute.")).toBeTruthy();
  });

  it("renders an optional description", () => {
    render(<EmptyState title="Titel" description="Beschreibung des leeren Zustands." />);
    expect(screen.getByText("Beschreibung des leeren Zustands.")).toBeTruthy();
  });

  it("renders without a description when none is given", () => {
    render(<EmptyState title="Titel" />);
    expect(screen.queryByText("Beschreibung des leeren Zustands.")).toBeNull();
  });

  it("renders an optional action", () => {
    render(<EmptyState title="Titel" action={<button type="button">Kontakt erstellen</button>} />);
    expect(screen.getByRole("button", { name: "Kontakt erstellen" })).toBeTruthy();
  });
});
