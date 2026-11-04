import { z } from "zod";
import type { SystemSettings } from "@/generated/prisma/client";
export const issuerSchema = z.object({
  name: z.string(),
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
  vatId: z.string(),
  taxNumber: z.string(),
  iban: z.string(),
  bic: z.string(),
  bankName: z.string(),
  paymentTermDays: z.number().int().min(0).max(365),
});
export function issuerSnapshot(settings: SystemSettings) {
  return {
    name: settings.legalCompanyName || settings.companyName,
    street: settings.street,
    postalCode: settings.postalCode,
    city: settings.city,
    country: settings.country,
    vatId: settings.vatId,
    taxNumber: settings.taxNumber,
    iban: settings.iban,
    bic: settings.bic,
    bankName: settings.bankName,
    paymentTermDays: settings.defaultPaymentTermDays,
  };
}
export const issuerIncomplete = (issuer: z.infer<typeof issuerSchema>) =>
  !issuer.name ||
  !issuer.street ||
  !issuer.postalCode ||
  !issuer.city ||
  (!issuer.vatId && !issuer.taxNumber);
