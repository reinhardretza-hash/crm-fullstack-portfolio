import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { generateInvoicePdf } from "@/modules/invoices/pdf";
import type { InvoicePdfData } from "@/modules/invoices/pdf-data";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const data: InvoicePdfData = {
  development: false,
  issuerDetails: "Test-Aussteller\nTeststraße 9\n12345 Berlin\nSteuernummer: TEST_ONLY",
  paymentDetails: "Bank: TEST_BANK\nIBAN: TEST_IBAN\nBIC: TEST_BIC",
  invoiceNumber: "RE-2026-0001",
  issuerName: "RDEvolution GbR",
  recipientName: "Müller GmbH",
  recipientContact: "Anna Müller",
  recipientAddress: "Teststraße 1\n12345 Berlin",
  issueDate: "2026-10-01",
  dueDate: "2026-11-01",
  currency: "EUR",
  createdAt: new Date("2026-10-01"),
  introText: "Vielen Dank für Ihr Interesse.",
  closingText: "Dieses Angebot ist gültig.",
  customerNote: "Kundenhinweis",
  subtotalCents: 10000,
  taxCents: 1900,
  totalCents: 11900,
  items: [
    {
      position: 1,
      title: "Webseite Beratung",
      description: "Abgestimmte Leistungen",
      quantity: 1000,
      unit: "Pauschal",
      unitPriceCents: 10000,
      taxRateBasisPoints: 1900,
      lineSubtotalCents: 10000,
      lineTaxCents: 1900,
      lineTotalCents: 11900,
    },
  ],
};
async function readPdf(buffer: Buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: false });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++)
    pages.push(
      (await (await pdf.getPage(p)).getTextContent()).items
        .map((i) => ("str" in i ? i.str : ""))
        .join(" "),
    );
  await task.destroy();
  return pages;
}
it("generates real PDF with Unicode, invoice number, recipient, lines and totals", async () => {
  const buffer = await generateInvoicePdf(data);
  expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  const pages = await readPdf(buffer);
  expect(pages).toHaveLength(1);
  for (const value of [
    "RE-2026-0001",
    "Rechnung RE-2026-0001",
    "Müller GmbH",
    "Anna Müller",
    "Teststraße",
    "Webseite Beratung",
    "100,00",
    "19,00",
    "119,00",
    "Kundenhinweis",
    "01.11.2026",
    "TEST_ONLY",
    "TEST_IBAN",
    "Seite 1 von 1",
  ])
    expect(pages[0]).toContain(value);
  expect(pages[0]).not.toContain("internalNote");
});
it("paginates long descriptions and long unbroken words with repeated header/footer", async () => {
  const items = Array.from({ length: 24 }, (_, i) => ({
    ...data.items[0],
    position: i + 1,
    title: `Leistung ${i + 1}`,
    description: "Ausführliche Leistungsbeschreibung mit überprüfbaren Ergebnissen. ".repeat(8),
  }));
  const pages = await readPdf(
    await generateInvoicePdf({
      ...data,
      items,
      closingText: "ABSCHLUSS_MARKER " + "x".repeat(2000),
    }),
  );
  expect(pages.length).toBeGreaterThan(2);
  for (const [i, page] of pages.entries()) {
    expect(page).toContain("RE-2026-0001");
    expect(page).toContain(`Seite ${i + 1} von ${pages.length}`);
  }
  expect(pages.join(" ")).toContain("Leistung 24");
  expect(pages.join(" ")).toContain("ABSCHLUSS_MARKER");
}, 15000);
