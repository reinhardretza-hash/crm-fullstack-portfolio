import "server-only";
import { generateDocumentPdf } from "@/modules/documents/pdf";
import type { InvoicePdfData } from "./pdf-data";
export const generateInvoicePdf = (data: InvoicePdfData) =>
  generateDocumentPdf(
    { ...data, quoteNumber: data.invoiceNumber, validUntil: data.dueDate },
    {
      issuerDetails: data.issuerDetails,
      paymentDetails: data.paymentDetails,
      development: data.development,
    },
  );
