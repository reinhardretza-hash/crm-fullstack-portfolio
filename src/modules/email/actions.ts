"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/rbac";
import { requirePermission } from "@/server/permissions";
import { AppError } from "@/lib/errors";
import { sendEmail } from "./service";
import { EmailError } from "./errors";
import { verifySmtp } from "./smtp";

export type EmailActionState = { error: string | null; emailId?: string; status?: string };
export async function sendEmailAction(
  _previous: EmailActionState,
  form: FormData,
): Promise<EmailActionState> {
  const user = await requireUser();
  requirePermission(user, "EMAIL_SEND");
  try {
    const message = await sendEmail(user.id, Object.fromEntries(form));
    revalidatePath("/emails");
    if (message.invoiceId) {
      revalidatePath("/invoices");
      revalidatePath(`/invoices/${message.invoiceId}`);
    }
    if (message.quoteId) {
      revalidatePath("/quotes");
      revalidatePath(`/quotes/${message.quoteId}`);
    }
    for (const [type, id] of [
      ["contacts", message.contactId],
      ["companies", message.companyId],
      ["leads", message.leadId],
      ["deals", message.dealId],
    ])
      if (id) revalidatePath(`/${type}/${id}`);
    return {
      error:
        message.status === "SENDING"
          ? "Der Versandstatus ist noch unklar. Bitte nicht erneut senden; den Owner kontaktieren."
          : message.errorMessage,
      emailId: message.id,
      status: message.status,
    };
  } catch (error) {
    return {
      error:
        error instanceof AppError
          ? error.userMessage
          : error instanceof EmailError
            ? error.message
            : "E-Mail konnte nicht vorbereitet werden. Bitte den Owner kontaktieren.",
    };
  }
}
export async function testSmtpAction(): Promise<{ success: boolean; message: string }> {
  const user = await requireUser();
  requirePermission(user, "SETTINGS_MANAGE");
  try {
    await verifySmtp();
    return { success: true, message: "Verbindung erfolgreich." };
  } catch (error) {
    return {
      success: false,
      message: error instanceof EmailError ? error.message : "Verbindung nicht möglich.",
    };
  }
}
