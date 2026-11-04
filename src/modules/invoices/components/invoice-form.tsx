"use client";
import { saveInvoiceAction } from "../actions";
import { DocumentForm, type QuoteDefaults } from "@/modules/documents/components/document-form";
import type { invoiceFormOptions } from "../queries";
export function InvoiceForm({
  options,
  defaults,
  id = null,
  version = 0,
  quoteId,
  duplicateWarning,
}: {
  options: Awaited<ReturnType<typeof invoiceFormOptions>>;
  defaults: Omit<QuoteDefaults, "validUntil"> & { dueDate: string };
  id?: string | null;
  version?: number;
  quoteId?: string;
  duplicateWarning?: string | null;
}) {
  return (
    <DocumentForm
      kind="invoice"
      quoteId={quoteId}
      duplicateWarning={duplicateWarning}
      options={options}
      defaults={{ ...defaults, validUntil: defaults.dueDate }}
      submitAction={saveInvoiceAction.bind(null, id, version)}
    />
  );
}
