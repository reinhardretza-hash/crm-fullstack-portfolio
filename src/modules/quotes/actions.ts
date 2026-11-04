"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/rbac";
import { AppError } from "@/lib/errors";
import { saveQuote, changeQuote } from "./service";
import type { QuoteStatus } from "./helpers";
export type QuoteActionState = { error: string | null };
function refresh() {
  for (const p of ["/quotes", "/companies", "/contacts", "/deals", "/dashboard"])
    revalidatePath(p, "layout");
}
export async function saveQuoteAction(
  id: string | null,
  expectedVersion: number,
  _prev: QuoteActionState,
  form: FormData,
): Promise<QuoteActionState> {
  const user = await requireUser();
  let quoteId: string;
  try {
    const items = JSON.parse(String(form.get("items") || "[]"));
    const quote = await saveQuote(
      user.id,
      { ...Object.fromEntries(form), items },
      id ? { id, expectedVersion } : undefined,
    );
    quoteId = quote.id;
    refresh();
  } catch (error) {
    return {
      error:
        error instanceof AppError
          ? error.userMessage
          : "Angebot konnte nicht gespeichert werden. Bitte die Eingaben prüfen.",
    };
  }
  redirect(`/quotes/${quoteId}`);
}
export async function changeQuoteAction(
  id: string,
  expectedVersion: number,
  status: QuoteStatus | "DELETE",
  _prev: QuoteActionState,
): Promise<QuoteActionState> {
  void _prev;
  const user = await requireUser();
  try {
    await changeQuote(user.id, { id, expectedVersion }, status);
    refresh();
  } catch (error) {
    return {
      error:
        error instanceof AppError ? error.userMessage : "Angebot konnte nicht geändert werden.",
    };
  }
  redirect(status === "DELETE" ? "/quotes?deleted=1" : `/quotes/${id}`);
}
