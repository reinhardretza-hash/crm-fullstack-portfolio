import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
vi.mock("@/server/rbac", () => ({
  requireUser: () => prisma.user.findUniqueOrThrow({ where: { id: "hardening-user" } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("CONTROLLED_REDIRECT");
  },
}));
import { deleteCompanyAction } from "@/modules/companies/actions";
import { deleteContactAction } from "@/modules/contacts/actions";
import { deleteLeadAction, updateLeadAction } from "@/modules/leads/actions";
import { deleteDealAction } from "@/modules/deals/actions";
import { addNoteAction } from "@/modules/notes/actions";
import { getRecentActivities } from "@/modules/dashboard/queries";
import { deleteTaskAction } from "@/modules/tasks/actions";
beforeEach(async () => {
  await prisma.user.create({
    data: {
      id: "hardening-user",
      email: "hardening@example.invalid",
      passwordHash: "unusable",
      firstName: "Hardening",
      lastName: "Test",
    },
  });
  await prisma.company.create({ data: { id: "hardening-company", name: "Hardening" } });
  await prisma.contact.create({
    data: { id: "hardening-contact", firstName: "Test", lastName: "Contact" },
  });
  await prisma.pipeline.create({
    data: {
      id: "hardening-pipeline",
      name: "Hardening",
      stages: { create: { id: "hardening-stage", name: "Open", position: 1 } },
    },
  });
  await prisma.lead.create({
    data: {
      id: "hardening-lead",
      title: "Original",
      companyId: "hardening-company",
      pipelineId: "hardening-pipeline",
      stageId: "hardening-stage",
    },
  });
  await prisma.deal.create({
    data: {
      id: "hardening-deal",
      name: "Hardening",
      companyId: "hardening-company",
      service: "WEBSITE",
      valueCents: 100,
    },
  });
  await prisma.task.create({
    data: {
      id: "hardening-task",
      title: "Hardening",
      dueAt: new Date(),
      assignedUserId: "hardening-user",
      createdById: "hardening-user",
    },
  });
});
it.each([
  ["Company", "hardening-company", deleteCompanyAction],
  ["Contact", "hardening-contact", deleteContactAction],
  ["Lead", "hardening-lead", deleteLeadAction],
  ["Deal", "hardening-deal", (id: string) => deleteDealAction(id, 1)],
  ["Task", "hardening-task", deleteTaskAction],
] as const)(
  "serializes parallel %s deletes and writes one audit only",
  async (entityType, id, remove) => {
    const outcomes = await Promise.allSettled([remove(id), remove(id)]);
    expect(outcomes.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((row) => row.status === "rejected")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { entityType, entityId: id } })).toBe(1);
    await expect(remove("missing")).rejects.toThrow("nicht gefunden");
    await expect(remove("")).rejects.toThrow();
  },
);
function form(version: string) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    title: "Stale overwrite",
    companyId: "hardening-company",
    pipelineId: "hardening-pipeline",
    stageId: "hardening-stage",
    expectedVersion: version,
  }))
    data.set(key, value);
  return data;
}
it("rejects a stale lead edit after another mutation changed its version", async () => {
  await prisma.lead.update({
    where: { id: "hardening-lead" },
    data: { version: { increment: 1 }, title: "Newer title" },
  });
  const result = await updateLeadAction("hardening-lead", { error: null }, form("1"));
  expect(result.error).toContain("zwischenzeitlich");
  expect((await prisma.lead.findUniqueOrThrow({ where: { id: "hardening-lead" } })).title).toBe(
    "Newer title",
  );
  expect(await prisma.auditLog.count()).toBe(0);
});
it("accepts current lead version and rejects a missing version", async () => {
  expect((await updateLeadAction("hardening-lead", { error: null }, form(""))).error).toContain(
    "Version",
  );
  await expect(updateLeadAction("hardening-lead", { error: null }, form("1"))).rejects.toThrow(
    "CONTROLLED_REDIRECT",
  );
  expect((await prisma.lead.findUniqueOrThrow({ where: { id: "hardening-lead" } })).version).toBe(
    2,
  );
});

it.each(["companyId", "contactId", "leadId", "dealId"] as const)(
  "refuses notes on deleted %s without writing history",
  async (key) => {
    const entity = { companyId: "company", contactId: "contact", leadId: "lead", dealId: "deal" }[
      key
    ];
    await prisma.$executeRawUnsafe(
      "UPDATE " +
        { company: "companies", contact: "contacts", lead: "leads", deal: "deals" }[entity] +
        " SET deleted_at=now() WHERE id=$1",
      "hardening-" + entity,
    );
    const data = new FormData();
    data.set("content", "Private synthetic note");
    data.set(key, "hardening-" + entity);
    expect((await addNoteAction({ error: null }, data)).error).toContain("gelöscht");
    expect(await prisma.note.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  },
);
it("excludes activities connected to deleted CRM entities from the dashboard", async () => {
  await prisma.activity.createMany({
    data: [
      { type: "COMPANY_CREATED", companyId: "hardening-company" },
      { type: "CONTACT_CREATED", contactId: "hardening-contact" },
    ],
  });
  expect(await getRecentActivities()).toHaveLength(2);
  await prisma.company.update({
    where: { id: "hardening-company" },
    data: { deletedAt: new Date() },
  });
  const activities = await getRecentActivities();
  expect(activities).toHaveLength(1);
  expect(activities[0].description).toContain("Contact");
});
