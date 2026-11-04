import "server-only";
import PDFDocument from "pdfkit";
import path from "node:path";
import { readFileSync } from "node:fs";
import { formatCentsAsEuro, scaledIntegerToDecimal } from "@/lib/money";
import type { QuotePdfData } from "@/modules/quotes/pdf-data";
const fontFolder = path.join(process.cwd(), "node_modules/@fontsource/noto-sans/files");
const regular = readFileSync(path.join(fontFolder, "noto-sans-latin-400-normal.woff"));
const bold = readFileSync(path.join(fontFolder, "noto-sans-latin-700-normal.woff"));
const clean = (text: string) =>
  text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").replace(/[\u2010-\u2015]/g, "-");
const date = (key: string) => key.split("-").reverse().join(".");
export async function generateDocumentPdf(
  data: QuotePdfData,
  invoice?: { issuerDetails: string; paymentDetails: string; development: boolean },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    bufferPages: true,
    info: {
      Title: `${invoice ? "Rechnung" : "Angebot"} ${data.quoteNumber}`,
      Author: data.issuerName,
      CreationDate: data.createdAt,
      ModDate: data.createdAt,
    },
  });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((success, reject) => {
    doc.on("data", (c) => chunks.push(Buffer.from(c)));
    doc.on("end", () => success(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("Regular", regular).registerFont("Bold", bold).font("Regular");
  const width = doc.page.width - 96,
    bottom = 754;
  let y = 48;
  function header(continuation = false) {
    const issuer = clean(data.issuerName);
    doc.font("Bold").fontSize(20).fillColor("#161616").text(issuer, 48, 48, { width });
    const ruleY = 48 + doc.heightOfString(issuer, { width }) + 10;
    doc.moveTo(48, ruleY).lineTo(547, ruleY).lineWidth(2).strokeColor("#b39a56").stroke();
    doc
      .font("Regular")
      .fontSize(9)
      .fillColor("#555555")
      .text(
        `${data.quoteNumber}${continuation ? " | Fortsetzung" : invoice ? " | Rechnung" : " | Angebot"}`,
        48,
        ruleY + 11,
        {
          width,
        },
      );
    y = ruleY + 39;
  }
  function space(height: number) {
    if (y + height > bottom) {
      doc.addPage();
      header(true);
    }
  }
  function textBlock(text: string, size = 10, face = "Regular") {
    // Render measured lines in page-sized groups, including arbitrarily long paragraphs.
    doc.font(face).fontSize(size).fillColor("#161616");
    for (const paragraph of clean(text).split("\n")) {
      let line = "";
      const emit = () => {
        space(size * (invoice ? 1.4 : 1.7));
        doc
          .font(face)
          .fontSize(size)
          .fillColor("#161616")
          .text(line || " ", 48, y, { width, lineBreak: false });
        y += size * (invoice ? 1.4 : 1.7);
        line = "";
      };
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (doc.widthOfString(candidate) <= width) {
          line = candidate;
          continue;
        }
        if (line) emit();
        if (doc.widthOfString(word) <= width) {
          line = word;
          continue;
        }
        // Split only unbroken strings which are wider than a full line.
        for (const char of word) {
          if (doc.widthOfString(line + char) > width) emit();
          line += char;
        }
      }
      emit();
    }
    y += invoice ? 5 : 8;
  }
  header();
  if (invoice?.issuerDetails) textBlock(invoice.issuerDetails, 9);
  if (invoice?.development)
    textBlock(
      "ENTWICKLUNGSSTAND - Ausstellerdaten unvollständig. Keine Rechtskonformität bestätigt.",
      9,
      "Bold",
    );
  textBlock(
    [data.recipientName, data.recipientContact, data.recipientAddress].filter(Boolean).join("\n"),
  );
  y += 10;
  textBlock(`${invoice ? "Rechnung" : "Angebot"} ${data.quoteNumber}`, 18, "Bold");
  textBlock(
    `${invoice ? "Rechnungsdatum" : "Angebotsdatum"}: ${date(data.issueDate)}     ${invoice ? "Fällig am" : "Gültig bis"}: ${date(data.validUntil)}`,
    9,
  );
  if (data.introText) textBlock(data.introText);
  function itemHeader() {
    space(40);
    doc.rect(48, y, width, 25).fill("#eeeeea");
    doc.font("Bold").fontSize(9).fillColor("#161616");
    doc.text("Position / Leistung", 56, y + 7, { width: 225, lineBreak: false });
    doc.text("Menge", 284, y + 7, { width: 58, align: "right", lineBreak: false });
    doc.text("Einzelpreis", 353, y + 7, { width: 85, align: "right", lineBreak: false });
    doc.text("Netto", 448, y + 7, { width: 91, align: "right", lineBreak: false });
    y += 36;
  }
  itemHeader();
  for (const item of data.items) {
    if (y + 95 > bottom) {
      doc.addPage();
      header(true);
      itemHeader();
    }
    const title = `${item.position}. ${item.title}`;
    doc.font("Bold").fontSize(10);
    const h = Math.max(30, doc.heightOfString(clean(title), { width: 222 }) + 7);
    space(h + 20);
    doc.text(clean(title), 56, y, { width: 222 });
    doc.font("Regular").fontSize(9);
    doc.text(
      scaledIntegerToDecimal(item.quantity, 3)
        .replace(/\.?0+$/, "")
        .replace(".", ","),
      284,
      y,
      { width: 58, align: "right" },
    );
    doc.text(formatCentsAsEuro(item.unitPriceCents), 353, y, { width: 85, align: "right" });
    doc.text(formatCentsAsEuro(item.lineSubtotalCents), 448, y, { width: 91, align: "right" });
    y += h;
    textBlock(`${item.unit} | Steuer: ${item.taxRateBasisPoints / 100} %`, 9);
    if (item.description) textBlock(item.description, 9);
    space(14);
    doc.moveTo(48, y).lineTo(547, y).lineWidth(0.5).strokeColor("#dddddd").stroke();
    y += 17;
  }
  space(125);
  y += 4;
  const totals = [
    ["Netto", data.subtotalCents],
    ["Steuer gesamt", data.taxCents],
    ["Gesamtbetrag", data.totalCents],
  ] as const;
  for (const [label, amount] of totals) {
    const strong = label === "Gesamtbetrag";
    if (strong) doc.rect(330, y - 4, 217, 31).fill("#f2eee3");
    doc
      .font(strong ? "Bold" : "Regular")
      .fontSize(strong ? 12 : 10)
      .fillColor("#161616");
    doc.text(label, 338, y, { width: 112, lineBreak: false });
    doc.text(formatCentsAsEuro(amount), 450, y, { width: 89, align: "right", lineBreak: false });
    y += 32;
  }
  const taxGroups = new Map<number, number>();
  for (const item of data.items)
    taxGroups.set(
      item.taxRateBasisPoints,
      (taxGroups.get(item.taxRateBasisPoints) || 0) + item.lineTaxCents,
    );
  textBlock(
    [...taxGroups]
      .map(([rate, value]) => `${rate / 100} % Steuer: ${formatCentsAsEuro(value)}`)
      .join(" | "),
    9,
  );
  y += 12;
  if (data.customerNote) {
    textBlock("Hinweise", 11, "Bold");
    textBlock(data.customerNote);
  }
  if (data.closingText) textBlock(data.closingText);
  if (invoice) {
    textBlock("Zahlungsinformationen", 11, "Bold");
    textBlock(invoice.paymentDetails);
  }
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(48, 770).lineTo(547, 770).lineWidth(0.5).strokeColor("#b39a56").stroke();
    doc
      .font("Regular")
      .fontSize(8)
      .fillColor("#555555")
      .text(`${data.quoteNumber} | Seite ${i + 1} von ${range.count}`, 48, 778, {
        width,
        align: "center",
        lineBreak: false,
      });
  }
  doc.end();
  return completed;
}
