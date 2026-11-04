import { createId } from "@paralleldrive/cuid2";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { activityFiltersSchema } from "@/validations/activity";
import { listRecentActivities } from "@/modules/activity/queries";
import { getNextStep, listRecentNotes } from "@/modules/customer-file/queries";
import {
  deleteFile,
  getFileForDownload,
  listFilesForTarget,
  uploadFile,
} from "@/modules/files/service";
import { MAX_FILE_BYTES } from "@/modules/files/validation";
import { runReminders } from "@/modules/reminders/service";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let uploadDir: string;
const NOW = new Date();
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const ahead = (days: number) => new Date(NOW.getTime() + days * DAY);

const PDF_BYTES = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(200, 65)]);
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(50),
]);
const makeFile = (bytes: Buffer, name: string, type: string) =>
  new File([new Uint8Array(bytes)], name, { type });

let userA: TestUser;
let userB: TestUser;
let admin: TestUser;
let company: { id: string };
let contact: { id: string };

type TestUser = Awaited<ReturnType<typeof mkUser>>;
async function mkUser(firstName: string, role: "USER" | "ADMIN" | "OWNER" = "USER") {
  return prisma.user.create({
    data: {
      id: createId(),
      email: `${firstName.toLowerCase()}-${createId()}@intern.test`,
      passwordHash: "x",
      firstName,
      lastName: "Akte",
      role,
    },
  });
}
const session = (user: { id: string; authVersion: number }) =>
  authMock.mockResolvedValue({ user: { id: user.id, authVersion: user.authVersion } });

const deal = (over: Record<string, unknown> = {}) =>
  prisma.deal.create({
    data: {
      id: createId(),
      name: "Akte-Deal",
      companyId: company.id,
      contactId: contact.id,
      service: "WEBSITE",
      valueCents: 1000,
      assignedUserId: userA.id,
      ...over,
    },
  });

beforeAll(() => {
  uploadDir = mkdtempSync(path.join(tmpdir(), "crm-uploads-"));
  process.env.CRM_UPLOAD_DIR = uploadDir;
});
afterAll(() => {
  rmSync(uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  for (const name of readdirSync(uploadDir)) rmSync(path.join(uploadDir, name), { force: true });
  userA = await mkUser("Anna");
  userB = await mkUser("Ben");
  admin = await mkUser("Admin", "ADMIN");
  company = await prisma.company.create({ data: { id: createId(), name: "Akte GmbH" } });
  contact = await prisma.contact.create({
    data: {
      id: createId(),
      firstName: "Karl",
      lastName: "Kunde",
      companyId: company.id,
      email: "karl@kunde.test",
    },
  });
});

describe("file upload", () => {
  it("stores a valid PDF privately with a random name, metadata and audit", async () => {
    const result = await uploadFile(userA.id, {
      file: makeFile(PDF_BYTES, "Angebot-Briefing.pdf", "application/pdf"),
      target: { companyId: company.id },
    });
    expect(result.ok).toBe(true);
    const row = await prisma.fileAttachment.findFirstOrThrow();
    expect(row).toMatchObject({
      originalName: "Angebot-Briefing.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF_BYTES.length,
      uploadedByUserId: userA.id,
      companyId: company.id,
      deletedAt: null,
    });
    expect(row.storedName).not.toContain("Angebot");
    expect(existsSync(path.join(uploadDir, row.storedName))).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "FILE_UPLOADED" } });
    expect(JSON.stringify(audit.metadata)).toContain("Angebot-Briefing.pdf");
    expect(JSON.stringify(audit.metadata)).not.toContain("AAAA"); // kein Dateiinhalt
  });

  it("accepts files for contacts and deals too", async () => {
    const d = await deal();
    expect(
      (
        await uploadFile(userA.id, {
          file: makeFile(PNG_BYTES, "Logo.png", "image/png"),
          target: { contactId: contact.id },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await uploadFile(userA.id, {
          file: makeFile(PDF_BYTES, "x.pdf", "application/pdf"),
          target: { dealId: d.id },
        })
      ).ok,
    ).toBe(true);
    expect(await prisma.fileAttachment.count()).toBe(2);
  });

  it("blocks a wrong MIME type, wrong content, bad extension and oversize files", async () => {
    const target = { companyId: company.id };
    const wrongMime = await uploadFile(userA.id, {
      file: makeFile(PDF_BYTES, "a.pdf", "image/png"),
      target,
    });
    const renamed = await uploadFile(userA.id, {
      file: makeFile(PNG_BYTES, "a.pdf", "application/pdf"),
      target,
    });
    const exe = await uploadFile(userA.id, {
      file: makeFile(PDF_BYTES, "a.exe", "application/pdf"),
      target,
    });
    const tooBig = await uploadFile(userA.id, {
      file: makeFile(
        Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(MAX_FILE_BYTES)]),
        "big.pdf",
        "application/pdf",
      ),
      target,
    });
    for (const result of [wrongMime, renamed, exe])
      expect(result).toMatchObject({ ok: false, status: 400 });
    expect(tooBig).toMatchObject({ ok: false, status: 413 });
    expect(await prisma.fileAttachment.count()).toBe(0);
    expect(readdirSync(uploadDir)).toHaveLength(0);
  });

  it("rejects missing, ambiguous and deleted targets", async () => {
    const file = () => makeFile(PDF_BYTES, "a.pdf", "application/pdf");
    expect(await uploadFile(userA.id, { file: file(), target: {} })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await uploadFile(userA.id, {
        file: file(),
        target: { companyId: company.id, contactId: contact.id },
      }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await uploadFile(userA.id, { file: file(), target: { companyId: "nope" } }),
    ).toMatchObject({
      ok: false,
      status: 404,
    });
    await prisma.company.update({ where: { id: company.id }, data: { deletedAt: new Date() } });
    expect(
      await uploadFile(userA.id, { file: file(), target: { companyId: company.id } }),
    ).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(readdirSync(uploadDir)).toHaveLength(0);
  });

  it("removes the stored file again when the database step fails (no orphans)", async () => {
    const result = await uploadFile("does-not-exist", {
      file: makeFile(PDF_BYTES, "a.pdf", "application/pdf"),
      target: { companyId: company.id },
    });
    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(readdirSync(uploadDir)).toHaveLength(0);
    expect(await prisma.fileAttachment.count()).toBe(0);
  });

  it("the database enforces exactly one target", async () => {
    await expect(
      prisma.fileAttachment.create({
        data: {
          id: createId(),
          originalName: "x.pdf",
          storedName: `${createId()}.pdf`,
          mimeType: "application/pdf",
          sizeBytes: 1,
          uploadedByUserId: userA.id,
          companyId: company.id,
          contactId: contact.id,
        },
      }),
    ).rejects.toBeDefined();
  });
});

describe("file download", () => {
  async function upload(target: Record<string, string> = { companyId: company.id }) {
    const result = await uploadFile(userA.id, {
      file: makeFile(PDF_BYTES, 'Vertrag "final".pdf', "application/pdf"),
      target,
    });
    if (!result.ok) throw new Error(result.error);
    return result.id;
  }

  it("requires authentication and serves the file as an attachment", async () => {
    const id = await upload();
    const { GET } = await import("@/app/api/files/[id]/route");
    const ctx = { params: Promise.resolve({ id }) };

    authMock.mockResolvedValue(null);
    expect((await GET(new Request("http://x"), ctx)).status).toBe(401);

    session(userB); // jeder angemeldete Benutzer darf herunterladen
    const response = await GET(new Request("http://x"), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename=/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await response.arrayBuffer()).equals(PDF_BYTES)).toBe(true);
  });

  it("blocks deactivated users, unknown ids, deleted files and files of deleted targets", async () => {
    const id = await upload();
    const { GET } = await import("@/app/api/files/[id]/route");
    const call = (fileId: string) =>
      GET(new Request("http://x"), { params: Promise.resolve({ id: fileId }) });

    await prisma.user.update({ where: { id: userB.id }, data: { isActive: false } });
    session(userB);
    expect((await call(id)).status).toBe(401);

    session(userA);
    expect((await call("../../etc/passwd")).status).toBe(404);
    expect((await call("unknown")).status).toBe(404);

    await prisma.company.update({ where: { id: company.id }, data: { deletedAt: new Date() } });
    expect((await call(id)).status).toBe(404);
    expect(await getFileForDownload(id)).toBeNull();
  });

  it("returns 404 when the file vanished from disk", async () => {
    const id = await upload();
    const row = await prisma.fileAttachment.findFirstOrThrow({ where: { id } });
    rmSync(path.join(uploadDir, row.storedName));
    const { GET } = await import("@/app/api/files/[id]/route");
    session(userA);
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ id }) })).status).toBe(
      404,
    );
  });

  it("upload route: 401 without session, 201 with multipart, 413 for oversized requests", async () => {
    const { POST } = await import("@/app/api/files/route");
    const form = () => {
      const body = new FormData();
      body.set("file", makeFile(PDF_BYTES, "route.pdf", "application/pdf"));
      body.set("companyId", company.id);
      return body;
    };
    authMock.mockResolvedValue(null);
    expect(
      (await POST(new Request("http://x/api/files", { method: "POST", body: form() }))).status,
    ).toBe(401);

    session(userA);
    const ok = await POST(new Request("http://x/api/files", { method: "POST", body: form() }));
    expect(ok.status).toBe(201);
    expect(await prisma.fileAttachment.count()).toBe(1);

    const huge = await POST(
      new Request("http://x/api/files", {
        method: "POST",
        body: form(),
        headers: { "content-length": String(MAX_FILE_BYTES * 3) },
      }),
    );
    expect(huge.status).toBe(413);

    const noFile = new FormData();
    noFile.set("companyId", company.id);
    expect(
      (await POST(new Request("http://x/api/files", { method: "POST", body: noFile }))).status,
    ).toBe(400);
  });
});

describe("file deletion", () => {
  async function upload(by = userA.id) {
    const result = await uploadFile(by, {
      file: makeFile(PDF_BYTES, "weg.pdf", "application/pdf"),
      target: { companyId: company.id },
    });
    if (!result.ok) throw new Error(result.error);
    return prisma.fileAttachment.findFirstOrThrow({ where: { id: result.id } });
  }

  it("soft-deletes the metadata, removes the stored file and audits", async () => {
    const row = await upload();
    expect(await deleteFile(userA, row.id)).toEqual({ ok: true });
    const after = await prisma.fileAttachment.findFirstOrThrow({ where: { id: row.id } });
    expect(after.deletedAt).not.toBeNull();
    expect(existsSync(path.join(uploadDir, row.storedName))).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: "FILE_DELETED" } })).toBe(1);
    expect((await listFilesForTarget({ companyId: company.id })).total).toBe(0);
    expect(await deleteFile(userA, row.id)).toMatchObject({ ok: false }); // nicht doppelt
  });

  it("only the uploader or OWNER/ADMIN may delete; foreign files stay untouched", async () => {
    const row = await upload();
    expect(await deleteFile(userB, row.id)).toMatchObject({ ok: false });
    expect(existsSync(path.join(uploadDir, row.storedName))).toBe(true);
    expect(
      (await prisma.fileAttachment.findFirstOrThrow({ where: { id: row.id } })).deletedAt,
    ).toBeNull();
    expect(await deleteFile(admin, row.id)).toEqual({ ok: true });
  });

  it("tolerates a file that is already gone from disk", async () => {
    const row = await upload();
    rmSync(path.join(uploadDir, row.storedName));
    expect(await deleteFile(userA, row.id)).toEqual({ ok: true });
  });

  it("the delete action enforces the same rules via the session", async () => {
    const row = await upload();
    const { deleteFileAction } = await import("@/modules/files/actions");
    session(userB);
    expect((await deleteFileAction(row.id)).error).toBeTruthy();
    session(userA);
    expect(await deleteFileAction(row.id)).toEqual({ error: null });
  });

  it("lists only active files, newest first, limited", async () => {
    for (let i = 0; i < 7; i++) await upload();
    const first = await prisma.fileAttachment.findFirstOrThrow();
    await deleteFile(userA, first.id);
    const { files, total } = await listFilesForTarget({ companyId: company.id }, 5);
    expect(files).toHaveLength(5);
    expect(total).toBe(6);
  });
});

describe("call log", () => {
  async function log(fields: Record<string, string>) {
    const { logCallAction } = await import("@/modules/customer-file/call-actions");
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return logCallAction({ error: null }, form);
  }

  it("creates a CALL_LOGGED activity and audit entry for a company", async () => {
    session(userA);
    const result = await log({
      companyId: company.id,
      outcome: "REACHED",
      durationMinutes: "12",
      note: "Termin besprochen",
      nextStep: "Angebot senden",
    });
    expect(result).toMatchObject({ error: null, saved: true });
    const activity = await prisma.activity.findFirstOrThrow({ where: { type: "CALL_LOGGED" } });
    expect(activity).toMatchObject({ userId: userA.id, companyId: company.id });
    expect(activity.metadata).toEqual({
      callOutcome: "REACHED",
      durationMinutes: 12,
      callNote: "Termin besprochen",
      nextStep: "Angebot senden",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "CALL_LOGGED" } });
    expect(JSON.stringify(audit.metadata)).not.toContain("Termin besprochen"); // kein Notizinhalt
  });

  it("links contact calls to the company and deal calls to deal, company and contact", async () => {
    session(userA);
    await log({ contactId: contact.id, outcome: "VOICEMAIL" });
    const d = await deal();
    await log({ dealId: d.id, outcome: "CALLBACK" });
    const calls = await prisma.activity.findMany({
      where: { type: "CALL_LOGGED" },
      orderBy: { createdAt: "asc" },
    });
    expect(calls[0]).toMatchObject({ contactId: contact.id, companyId: company.id, dealId: null });
    expect(calls[1]).toMatchObject({ dealId: d.id, companyId: company.id, contactId: contact.id });
  });

  it("sets the follow-up date through the unique lead of a deal", async () => {
    session(userA);
    const pipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "P",
        isDefault: true,
        stages: { create: [{ id: createId(), name: "S", position: 1 }] },
      },
      include: { stages: true },
    });
    const lead = await prisma.lead.create({
      data: {
        id: createId(),
        title: "Lead",
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
      },
    });
    const d = await deal({ leadId: lead.id });
    expect(
      await log({ dealId: d.id, outcome: "REACHED", followUpDate: "2026-12-01" }),
    ).toMatchObject({ error: null });
    expect(
      (
        await prisma.lead.findFirstOrThrow({ where: { id: lead.id } })
      ).nextFollowUpAt?.toISOString(),
    ).toBe("2026-12-01T08:00:00.000Z");
    expect(
      await prisma.activity.count({ where: { type: "LEAD_FOLLOW_UP_CHANGED", leadId: lead.id } }),
    ).toBe(1);
  });

  it("rejects a follow-up without a lead, invalid input, deleted targets and missing sessions", async () => {
    session(userA);
    const noLead = await log({
      companyId: company.id,
      outcome: "REACHED",
      followUpDate: "2026-12-01",
    });
    expect(noLead.error).toContain("Lead");
    expect(await prisma.activity.count({ where: { type: "CALL_LOGGED" } })).toBe(0); // Transaktion zurückgerollt
    expect((await log({ companyId: company.id })).error).toBeTruthy();
    expect(
      (await log({ companyId: company.id, contactId: contact.id, outcome: "REACHED" })).error,
    ).toBeTruthy();
    await prisma.company.update({ where: { id: company.id }, data: { deletedAt: new Date() } });
    expect((await log({ companyId: company.id, outcome: "REACHED" })).error).toBeTruthy();
    authMock.mockResolvedValue(null);
    await expect(log({ companyId: company.id, outcome: "REACHED" })).rejects.toBeDefined();
  });
});

describe("customer file data", () => {
  it("next step: overdue task first, then follow-up, event, reminder (scoped, no deleted)", async () => {
    const other = await prisma.company.create({ data: { id: createId(), name: "Andere GmbH" } });
    const task = (title: string, dueAt: Date, over: Record<string, unknown> = {}) =>
      prisma.task.create({
        data: {
          id: createId(),
          title,
          dueAt,
          assignedUserId: userA.id,
          createdById: userA.id,
          companyId: company.id,
          ...over,
        },
      });
    await task("Fremde Aufgabe", ago(5), { companyId: other.id });
    await task("Gelöscht", ago(9), { deletedAt: new Date() });
    await task("Erledigt", ago(8), { status: "COMPLETED" });
    await task("Später", ahead(5));
    let step = await getNextStep({ kind: "company", id: company.id }, userA);
    expect(step.primary).toMatchObject({ kind: "TASK_UPCOMING", title: "Später" });

    await prisma.calendarEvent.create({
      data: {
        id: createId(),
        title: "Termin",
        startsAt: ahead(1),
        endsAt: ahead(1.1),
        assignedUserId: userA.id,
        createdById: userA.id,
        companyId: company.id,
      },
    });
    step = await getNextStep({ kind: "company", id: company.id }, userA);
    expect(step.primary).toMatchObject({ kind: "EVENT", title: "Termin" });

    const pipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "P",
        isDefault: true,
        stages: { create: [{ id: createId(), name: "S", position: 1 }] },
      },
      include: { stages: true },
    });
    await prisma.lead.create({
      data: {
        id: createId(),
        title: "FU-Lead",
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        nextFollowUpAt: ago(1),
      },
    });
    step = await getNextStep({ kind: "company", id: company.id }, userA);
    expect(step.primary).toMatchObject({ kind: "FOLLOW_UP_DUE", title: "FU-Lead" });

    await task("Überfällig", ago(2));
    step = await getNextStep({ kind: "company", id: company.id }, userA);
    expect(step.primary).toMatchObject({ kind: "TASK_OVERDUE", title: "Überfällig" });
    expect(step.others.map((i) => i.kind)).toEqual(["FOLLOW_UP_DUE", "EVENT", "TASK_UPCOMING"]);
    expect(step.total).toBe(4);
    expect(step.others.some((i) => i.title === "Fremde Aufgabe" || i.title === "Gelöscht")).toBe(
      false,
    );
  });

  it("deal scope uses only its own lead for the follow-up; contacts use their leads", async () => {
    const pipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "P",
        isDefault: true,
        stages: { create: [{ id: createId(), name: "S", position: 1 }] },
      },
      include: { stages: true },
    });
    const mkLead = (title: string, over: Record<string, unknown> = {}) =>
      prisma.lead.create({
        data: {
          id: createId(),
          title,
          companyId: company.id,
          pipelineId: pipeline.id,
          stageId: pipeline.stages[0].id,
          nextFollowUpAt: ago(1),
          ...over,
        },
      });
    const own = await mkLead("Eigener Lead");
    await mkLead("Fremder Lead", { contactId: contact.id });
    const d = await deal({ leadId: own.id });
    const noLeadDeal = await deal({ name: "Ohne Lead" });

    const dealStep = await getNextStep({ kind: "deal", id: d.id }, userA, { dealLeadId: own.id });
    expect(dealStep.primary?.title).toBe("Eigener Lead");
    const unrelated = await getNextStep({ kind: "deal", id: noLeadDeal.id }, userA, {
      dealLeadId: null,
    });
    expect(unrelated.primary).toBeNull(); // nicht raten
    const contactStep = await getNextStep({ kind: "contact", id: contact.id }, userA);
    expect(contactStep.primary?.title).toBe("Fremder Lead");
  });

  it("includes open reminders of the company's documents and deals", async () => {
    const settings =
      (await prisma.reminderSettings.findFirst()) ??
      (await prisma.reminderSettings.create({ data: {} }));
    await prisma.reminderSettings.update({
      where: { id: settings.id },
      data: { dealEnabled: true },
    });
    await deal({ createdAt: ago(30) });
    const mailer = { fromEmail: "crm@rdevolution.invalid", send: async () => undefined };
    await runReminders({ mailer, baseUrl: "https://x.test", now: NOW });
    const step = await getNextStep({ kind: "company", id: company.id }, userA);
    expect(step.primary).toMatchObject({ kind: "REMINDER" });
    expect(step.primary?.title).toContain("Deal ohne Aktivität");
    const mine = await getNextStep(
      { kind: "company", id: company.id },
      { id: userB.id, role: "USER" },
    );
    expect(mine.primary).toBeNull(); // USER sieht nur eigene Reminder
  });

  it("notes are limited and counted; activities reuse the Phase-12 filter incl. indirect ones", async () => {
    for (let i = 0; i < 7; i++) {
      await prisma.note.create({
        data: { id: createId(), content: `N${i}`, authorId: userA.id, companyId: company.id },
      });
    }
    const { notes, total } = await listRecentNotes({ kind: "company", id: company.id }, 5);
    expect(notes).toHaveLength(5);
    expect(total).toBe(7);

    const d = await deal();
    await prisma.activity.create({ data: { id: createId(), type: "DEAL_CREATED", dealId: d.id } });
    await prisma.activity.create({
      data: { id: createId(), type: "COMPANY_UPDATED", companyId: company.id },
    });
    const other = await prisma.company.create({ data: { id: createId(), name: "Andere" } });
    await prisma.activity.create({
      data: { id: createId(), type: "COMPANY_UPDATED", companyId: other.id },
    });
    const list = await listRecentActivities(
      activityFiltersSchema.parse({ companyId: company.id }),
      15,
    );
    expect(list.map((a) => a.type).sort()).toEqual(["COMPANY_UPDATED", "DEAL_CREATED"]);
    const limited = await listRecentActivities(
      activityFiltersSchema.parse({ companyId: company.id }),
      1,
    );
    expect(limited).toHaveLength(1);
  });
});
