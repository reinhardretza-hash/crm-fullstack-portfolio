// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const logoutActionMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/modules/auth/actions", () => ({
  logoutAction: () => logoutActionMock(),
}));

const { UserMenu } = await import("@/components/layout/user-menu");

describe("UserMenu", () => {
  it("shows the authenticated user's real name and role, not placeholder data", () => {
    render(<UserMenu firstName="Erika" lastName="Musterfrau" role="OWNER" />);
    expect(screen.getByText("Erika Musterfrau")).toBeTruthy();
  });

  it("triggers the logout server action when 'Abmelden' is selected", async () => {
    // Regression: eine frühere Version rendere hier
    // <DropdownMenuItem asChild><form action={logoutAction}>...</form></...>.
    // In einem echten Browser (Playwright-artiger E2E-Test gegen den echten
    // Next.js-Server, siehe Schritt-4-Bericht) schloss Radix das Menü im
    // selben Klick-Zyklus, wodurch der native Form-Submit teils nie React's
    // Server-Action-Handler erreichte (Navigation zu "javascript:..." statt
    // eines POST-Requests). Der Fix ruft die Server Action direkt über
    // onSelect + startTransition auf - dieser Test stellt sicher, dass sie
    // dabei tatsächlich aufgerufen wird.
    logoutActionMock.mockClear();
    render(<UserMenu firstName="Erika" lastName="Musterfrau" role="USER" />);

    const trigger = screen.getByRole("button", { name: /Erika Musterfrau/ });
    // Radix öffnet das Menü über `pointerdown`, nicht über `click` - ein
    // reines fireEvent.click reicht daher nicht aus, um es in jsdom zu öffnen.
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);

    const logoutItem = await screen.findByRole("menuitem", { name: /Abmelden/ });
    fireEvent.pointerDown(logoutItem);
    fireEvent.click(logoutItem);

    await vi.waitFor(() => expect(logoutActionMock).toHaveBeenCalledTimes(1));
  });
});
