"use client";
import { saveQuoteAction } from "../actions";
import { DocumentForm, type QuoteDefaults } from "@/modules/documents/components/document-form";
import type { quoteFormOptions } from "../queries";
export type { ItemDraft, QuoteDefaults } from "@/modules/documents/components/document-form";
export function QuoteForm({
  options,
  defaults,
  id = null,
  version = 0,
}: {
  options: Awaited<ReturnType<typeof quoteFormOptions>>;
  defaults: QuoteDefaults;
  id?: string | null;
  version?: number;
}) {
  return (
    <DocumentForm
      options={options}
      defaults={defaults}
      submitAction={saveQuoteAction.bind(null, id, version)}
    />
  );
}
