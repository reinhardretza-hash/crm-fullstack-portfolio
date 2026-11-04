// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { QUOTE_STATUSES, canDeleteQuote, effectiveQuoteStatus } from "@/modules/quotes/helpers";
import { INVOICE_STATUSES, canDeleteInvoice } from "@/modules/invoices/helpers";
import { canDeleteDeal } from "@/modules/deals/status";
const actions = vi.hoisted(() => ({ quote: vi.fn(), invoice: vi.fn() }));
vi.mock("@/modules/quotes/actions", () => ({ changeQuoteAction: actions.quote }));
vi.mock("@/modules/invoices/actions", () => ({ changeInvoiceAction: actions.invoice }));
import { QuoteActions } from "@/modules/quotes/components/quote-actions";
import { InvoiceActions } from "@/modules/invoices/components/invoice-actions";

it.each(QUOTE_STATUSES)("quote delete rule and UI for %s", (status) => {
  expect(canDeleteQuote(status)).toBe(["DRAFT", "READY"].includes(status));
  render(<QuoteActions id="quote" version={7} status={status} number="ANG-2026-0002" />);
  expect(!!screen.queryByRole("button", { name: "Angebot löschen" })).toBe(
    ["DRAFT", "READY"].includes(status),
  );
});
it.each(INVOICE_STATUSES)("invoice delete rule and UI for %s", (status) => {
  expect(canDeleteInvoice(status)).toBe(["DRAFT", "READY"].includes(status));
  render(<InvoiceActions id="invoice" version={8} status={status} number="RE-2026-0001" />);
  expect(!!screen.queryByRole("button", { name: "Rechnung löschen" })).toBe(
    ["DRAFT", "READY"].includes(status),
  );
});
it.each(["OPEN", "WON", "LOST"] as const)("deal delete rule for %s", (status) => {
  expect(canDeleteDeal(status)).toBe(status === "OPEN");
});
it("expired READY quote is not deletable", () => {
  expect(
    canDeleteQuote(effectiveQuoteStatus({ status: "READY", validUntil: new Date("2020-01-01") })),
  ).toBe(false);
});
it("document deletion displays its number and cancelling does not call the server", () => {
  render(<QuoteActions id="quote" version={7} status="READY" number="ANG-2026-0002" />);
  fireEvent.click(screen.getByRole("button", { name: "Angebot löschen" }));
  expect(
    screen.getByRole("heading", { name: "Angebot ANG-2026-0002 wirklich löschen?" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
  expect(actions.quote).not.toHaveBeenCalled();
});
