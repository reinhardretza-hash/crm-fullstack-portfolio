// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EntityDeleteDialog } from "@/components/ui/entity-delete-dialog";
import { DocumentSendLink } from "@/modules/email/components/document-send-link";
import { ComposeForm } from "@/modules/email/components/compose-form";
import { quoteEmailPrefill } from "@/modules/quotes/helpers";
import { invoiceEmailPrefill } from "@/modules/invoices/helpers";

vi.mock("@/modules/email/actions", () => ({ sendEmailAction: vi.fn() }));

it.each(["Unternehmen", "Kontakt"] as const)(
  "requires confirmation and supports cancelling %s deletion",
  (entity) => {
    const remove = vi.fn();
    render(<EntityDeleteDialog entity={entity} name="Synthetischer Test" deleteAction={remove} />);
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    expect(screen.getByRole("dialog").textContent).toContain("Synthetischer Test");
    expect(screen.getByRole("dialog").textContent).toContain(
      "Historische Verknüpfungen bleiben erhalten",
    );
    expect(globalThis.document.activeElement).toBe(
      screen.getByRole("button", { name: "Abbrechen" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

it("locks confirmation during submission and shows the server error", async () => {
  let finish!: (value: { error: string | null }) => void;
  const remove = vi.fn(
    () =>
      new Promise<{ error: string | null }>((resolve) => {
        finish = resolve;
      }),
  );
  render(<EntityDeleteDialog entity="Kontakt" name="Testkontakt" deleteAction={remove} />);
  fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
  fireEvent.click(screen.getByRole("button", { name: "Kontakt löschen" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Wird gelöscht …" }).hasAttribute("disabled")).toBe(
      true,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Wird gelöscht …" }));
  expect(remove).toHaveBeenCalledTimes(1);
  finish({ error: "Datensatz wurde nicht gefunden oder bereits gelöscht." });
  expect((await screen.findByRole("alert")).textContent).toContain("bereits gelöscht");
});

const document = {
  id: "document-id",
  contactId: "contact-id",
  company: { deletedAt: null },
  contact: { email: "recipient@example.invalid", deletedAt: null },
  deal: null,
};

it.each(["Angebot", "Rechnung"] as const)(
  "opens %s compose only with an active recipient",
  (kind) => {
    const { rerender } = render(<DocumentSendLink kind={kind} document={document} ready />);
    expect(screen.getByRole("link", { name: "Per E-Mail senden" }).getAttribute("href")).toBe(
      `/emails/new?${kind === "Angebot" ? "quoteId" : "invoiceId"}=document-id`,
    );
    for (const contact of [
      null,
      { email: null, deletedAt: null },
      { email: "   ", deletedAt: null },
      { email: "recipient@example.invalid", deletedAt: new Date() },
    ]) {
      rerender(<DocumentSendLink kind={kind} document={{ ...document, contact }} ready />);
      expect(screen.queryByRole("link", { name: "Per E-Mail senden" })).toBeNull();
      expect(screen.getByText(/keine Empfänger-E-Mail|Kontext ist gelöscht/)).toBeTruthy();
    }
    rerender(
      <DocumentSendLink
        kind={kind}
        document={{ ...document, company: { deletedAt: new Date() } }}
        ready
      />,
    );
    expect(screen.queryByRole("link", { name: "Per E-Mail senden" })).toBeNull();
    rerender(<DocumentSendLink kind={kind} document={document} ready={false} />);
    expect(screen.queryByRole("link", { name: "Per E-Mail senden" })).toBeNull();
  },
);

it.each(["quote", "invoice"] as const)(
  "prefills editable %s recipient, subject, body and PDF without sending",
  (kind) => {
    const number = kind === "quote" ? "ANG-2026-0001" : "RE-2026-0001";
    const prefill =
      kind === "quote"
        ? quoteEmailPrefill({
            quoteNumber: number,
            issuerName: "RDEvolution GbR",
            recipientName: "Test GmbH",
            recipientContact: "Testkontakt",
          })
        : invoiceEmailPrefill({
            invoiceNumber: number,
            issuerName: "RDEvolution GbR",
            recipientContact: "Testkontakt",
          });
    render(
      <ComposeForm
        context={{ companyId: "company-id", contactId: "contact-id" }}
        idempotencyKey="synthetic-key"
        recipient="recipient@example.invalid"
        templates={[]}
        configured
        {...{ [kind]: { id: "document-id", version: 2, number, ...prefill } }}
      />,
    );
    expect((screen.getByRole("textbox", { name: "An" }) as HTMLInputElement).value).toBe(
      "recipient@example.invalid",
    );
    const subject = screen.getByRole("textbox", { name: /Betreff/ }) as HTMLInputElement;
    expect(subject.value).toBe(
      `${kind === "quote" ? "Angebot" : "Rechnung"} ${number} – RDEvolution GbR`,
    );
    fireEvent.change(subject, { target: { value: "Geprüfter Betreff" } });
    expect(subject.value).toBe("Geprüfter Betreff");
    expect(screen.getByText(new RegExp(`Anhang: ${number}\\.pdf`))).toBeTruthy();
    expect(screen.getByRole("link", { name: "PDF prüfen" }).getAttribute("href")).toBe(
      `/${kind === "quote" ? "quotes" : "invoices"}/document-id/pdf`,
    );
  },
);
