import "server-only";
import { generateDocumentPdf } from "@/modules/documents/pdf";
import type { QuotePdfData } from "./pdf-data";
export const generateQuotePdf = (data: QuotePdfData) => generateDocumentPdf(data);
