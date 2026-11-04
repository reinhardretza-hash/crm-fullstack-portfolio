"use server";

import { AppError } from "@/lib/errors";
import { entityIdSchema } from "@/validations/entity";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { extractDomain, normalizeEmail } from "@/lib/normalize";
import { requireUser } from "@/server/rbac";
import { companyFormSchema } from "@/validations/company";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { logActivity } from "@/modules/activity/log";
import { resolveTagIds } from "@/modules/tags/service";

export type CompanyActionState = {
  error: string | null;
};

// `FormData.get()` returns `string | File | null` - `null` specifically for
// a field name that is entirely absent from the submitted form. Our schema's
// optional string fields only accept `string | undefined`, never `null`
// (Zod's `.optional()` does not treat `null` as absent). Our own forms
// always render every field, so this never actually happens through the UI
// today, but relying on that being forever true is fragile - a real
// PostgreSQL integration test caught this by submitting FormData with
// genuinely missing keys.
function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function parseFormData(formData: FormData) {
  return {
    name: str(formData, "name"),
    website: str(formData, "website"),
    industry: str(formData, "industry"),
    phone: str(formData, "phone"),
    email: str(formData, "email"),
    street: str(formData, "street"),
    postalCode: str(formData, "postalCode"),
    city: str(formData, "city"),
    country: str(formData, "country"),
    employeeCount: str(formData, "employeeCount"),
    companySize: str(formData, "companySize") || undefined,
    description: str(formData, "description"),
    status: str(formData, "status") || undefined,
    source: str(formData, "source") || undefined,
    assignedUserId: str(formData, "assignedUserId"),
    needs: formData.getAll("needs"),
    tags: formData
      .getAll("tags")
      .flatMap((value) => String(value).split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

export async function createCompanyAction(
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();

  const parsed = companyFormSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }

  const data = parsed.data;
  const websiteDomain = safeExtractDomain(data.website);
  const emailNormalized = data.email ? normalizeEmail(data.email) : undefined;

  let companyId: string;
  try {
    companyId = await prisma.$transaction(async (tx) => {
      const tagIds = await resolveTagIds(tx, data.tags);

      const company = await tx.company.create({
        data: {
          name: data.name,
          website: data.website,
          websiteDomain,
          industry: data.industry,
          phone: data.phone,
          email: data.email,
          emailNormalized,
          street: data.street,
          postalCode: data.postalCode,
          city: data.city,
          country: data.country,
          employeeCount: data.employeeCount,
          companySize: data.companySize,
          description: data.description,
          status: data.status,
          source: data.source,
          assignedUserId: data.assignedUserId || null,
          needs: { create: data.needs.map((need) => ({ need })) },
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
        },
      });

      await logActivity(tx, { type: "COMPANY_CREATED", userId: user.id, companyId: company.id });
      await writeCrmAuditLog(tx, {
        action: "COMPANY_CREATED",
        userId: user.id,
        entityType: "Company",
        entityId: company.id,
      });

      return company.id;
    });
  } catch {
    return { error: "Unternehmen konnte nicht gespeichert werden." };
  }

  redirect(`/companies/${companyId}`);
}

export async function updateCompanyAction(
  companyId: string,
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const user = await requireUser();

  const existing = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
  if (!existing) {
    return { error: "Unternehmen wurde nicht gefunden." };
  }

  const parsed = companyFormSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }

  const data = parsed.data;
  const websiteDomain = safeExtractDomain(data.website);
  const emailNormalized = data.email ? normalizeEmail(data.email) : undefined;

  try {
    await prisma.$transaction(async (tx) => {
      const tagIds = await resolveTagIds(tx, data.tags);

      await tx.company.update({
        where: { id: companyId },
        data: {
          name: data.name,
          website: data.website,
          websiteDomain,
          industry: data.industry,
          phone: data.phone,
          email: data.email,
          emailNormalized,
          street: data.street,
          postalCode: data.postalCode,
          city: data.city,
          country: data.country,
          employeeCount: data.employeeCount,
          companySize: data.companySize,
          description: data.description,
          status: data.status,
          source: data.source,
          assignedUserId: data.assignedUserId || null,
          needs: {
            deleteMany: {},
            create: data.needs.map((need) => ({ need })),
          },
          tags: {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
      });

      await logActivity(tx, { type: "COMPANY_UPDATED", userId: user.id, companyId });
      await writeCrmAuditLog(tx, {
        action: "COMPANY_UPDATED",
        userId: user.id,
        entityType: "Company",
        entityId: companyId,
      });
    });
  } catch {
    return { error: "Unternehmen konnte nicht gespeichert werden." };
  }

  redirect(`/companies/${companyId}`);
}

// Atomisches Soft Delete: historische Datensätze und Beziehungen bleiben erhalten.
export async function deleteCompanyAction(companyId: string): Promise<void> {
  const user = await requireUser();
  entityIdSchema.parse(companyId);

  await prisma.$transaction(async (tx) => {
    const changed = await tx.company.updateMany({
      where: { id: companyId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (changed.count !== 1)
      throw new AppError("Datensatz wurde nicht gefunden oder bereits gelöscht.");
    await writeCrmAuditLog(tx, {
      action: "COMPANY_DELETED",
      userId: user.id,
      entityType: "Company",
      entityId: companyId,
    });
  });
  revalidatePath("/companies");
  revalidatePath("/dashboard");
}

export async function deleteCompanyFromDetailAction(
  companyId: string,
): Promise<CompanyActionState> {
  try {
    await deleteCompanyAction(companyId);
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    throw error;
  }
  redirect("/companies?deleted=1");
}

function safeExtractDomain(website: string | undefined): string | undefined {
  if (!website) return undefined;
  try {
    return extractDomain(website);
  } catch {
    return undefined;
  }
}
