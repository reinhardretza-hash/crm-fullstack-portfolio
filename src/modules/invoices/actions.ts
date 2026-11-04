"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/rbac";
import { AppError } from "@/lib/errors";
import { saveInvoice, changeInvoice } from "./service";
import type { InvoiceStatus } from "./helpers";
export type InvoiceActionState = { error: string | null };
function refresh() {
  for (const p of ["/quotes", "/invoices", "/companies", "/contacts", "/deals", "/dashboard"])
    revalidatePath(p, "layout");
}
export async function saveInvoiceAction(
  id: string | null,
  expectedVersion: number,
  _prev: InvoiceActionState,
  form: FormData,
): Promise<InvoiceActionState> {
  const user = await requireUser();
  let invoiceId: string;
  try {
    const items = JSON.parse(String(form.get("items") || "[]"));
    const invoice = await saveInvoice(
      user.id,
      { ...Object.fromEntries(form), items },
      id ? { id, expectedVersion } : undefined,
    );
    invoiceId = invoice.id;
    refresh();
  } catch (error) {
    return {
      error:
        error instanceof AppError
          ? error.userMessage
          : "Rechnung konnte nicht gespeichert werden. Bitte die Eingaben prüfen.",
    };
  }
  redirect(`/invoices/${invoiceId}`);
}
export async function changeInvoiceAction(
  id: string,
  expectedVersion: number,
  status: InvoiceStatus | "DELETE",
  _prev: InvoiceActionState,
): Promise<InvoiceActionState> {
  void _prev;
  const user = await requireUser();
  try {
    await changeInvoice(user.id, { id, expectedVersion }, status);
    refresh();
  } catch (error) {
    return {
      error:
        error instanceof AppError ? error.userMessage : "Rechnung konnte nicht geändert werden.",
    };
  }
  redirect(status === "DELETE" ? "/invoices?deleted=1" : `/invoices/${id}`);
}
