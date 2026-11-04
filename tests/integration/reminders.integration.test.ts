import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { listAttentionReminders } from "@/modules/reminders/queries";
import { runReminders, type ReminderMailer } from "@/modules/reminders/service";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Freitag, 15.05.2026 12:00 Berlin.
const NOW = new Date("2026-05-15T10:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const dateOnly = (days: number) =>
  new Date(`${new Date(NOW.getTime() + days * DAY).toISOString().slice(0, 10)}T00:00:00Z`);
const BASE_URL = "https://app.test.local";
const FROM = "crm@rdevolution.invalid";

type Sent = {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  textBody: string;
};

function makeMailer(opts: { fail?: boolean | (() => boolean) } = {}) {
  const sent: Sent[] = [];
  const mailer: ReminderMailer = {
    fromEmail: FROM,
    async send(mail) {
      const fail = typeof opts.fail === "function" ? opts.fail() : opts.fail;
      if (fail) throw Object.assign(new Error("secret smtp detail"), { code: "SMTP_DOWN" });
      sent.push(mail);
    },
  };
  return { mailer, sent };
}
const run = (mailer: ReminderMailer, extra: { batchLimit?: number; now?: Date } = {}) =>
  runReminders({ mailer, baseUrl: BASE_URL, now: extra.now ?? NOW, ...extra });

let numberCounter = 0;
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let inactive: { id: string; email: string };
let company: { id: string };

async function mkUser(firstName: string, isActive = true) {
  return prisma.user.create({
    data: {
      id: createId(),
      email: `${firstName.toLowerCase()}-${createId()}@intern.test`,
      passwordHash: "x",
      firstName,
      lastName: "Rem",
      isActive,
    },
  });
}

async function enableAll() {
  const existing = await prisma.reminderSettings.findFirst();
  const data = {
    quoteEnabled: true,
    dealEnabled: true,
    followUpEnabled: true,
    taskEnabled: true,
    invoiceEnabled: true,
  };
  if (existing) await prisma.reminderSettings.update({ where: { id: existing.id }, data });
  else await prisma.reminderSettings.create({ data });
}

const quote = (over: Record<string, unknown> = {}) =>
  prisma.quote.create({
    data: {
      id: createId(),
      quoteNumber: `ANG-2026-${String(++numberCounter).padStart(4, "0")}`,
      status: "SENT",
      companyId: company.id,
      assignedUserId: userA.id,
      createdById: userA.id,
      issueDate: dateOnly(-9),
      validUntil: dateOnly(30),
      sentAt: ago(8),
      currency: "EUR",
      subtotalCents: 1000,
      taxCents: 0,
      totalCents: 1000,
      issuerName: "RDEvolution",
      recipientName: "Kunde",
      recipientAddress: "Teststr. 1",
      ...over,
    },
  });
const deal = (over: Record<string, unknown> = {}) =>
  prisma.deal.create({
    data: {
      id: createId(),
      name: "Reminder-Deal",
      companyId: company.id,
      service: "WEBSITE",
      valueCents: 1000,
      createdAt: ago(20),
      assignedUserId: userA.id,
      ...over,
    },
  });
async function lead(over: Record<string, unknown> = {}) {
  const pipeline =
    (await prisma.pipeline.findFirst({ include: { stages: true } })) ??
    (await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "P",
        isDefault: true,
        stages: { create: [{ id: createId(), name: "S", position: 1 }] },
      },
      include: { stages: true },
    }));
  return prisma.lead.create({
    data: {
      id: createId(),
      title: "Reminder-Lead",
      companyId: company.id,
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      nextFollowUpAt: ago(1),
      assignedUserId: userA.id,
      ...over,
    },
  });
}
const task = (over: Record<string, unknown> = {}) =>
  prisma.task.create({
    data: {
      id: createId(),
      title: "Reminder-Task",
      dueAt: ago(1),
      assignedUserId: userA.id,
      createdById: userA.id,
      ...over,
    },
  });
const invoice = (over: Record<string, unknown> = {}) =>
  prisma.invoice.create({
    data: {
      id: createId(),
      invoiceNumber: `RE-2026-${String(++numberCounter).padStart(4, "0")}`,
      status: "SENT",
      companyId: company.id,
      assignedUserId: userA.id,
      createdById: userA.id,
      issueDate: dateOnly(-20),
      dueDate: dateOnly(-3),
      currency: "EUR",
      subtotalCents: 5000,
      taxCents: 0,
      totalCents: 5000,
      issuerName: "RDEvolution",
      issuerSnapshot: {},
      recipientName: "Kunde",
      recipientAddress: "Teststr. 1",
      ...over,
    },
  });

async function seedAllRules() {
  const q = await quote();
  const d = await deal();
  const l = await lead();
  const t = await task();
  const i = await invoice();
  return { q, d, l, t, i };
}

beforeEach(async () => {
  numberCounter = 0;
  userA = await mkUser("Anna");
  userB = await mkUser("Ben");
  inactive = await mkUser("Inaktiv", false);
  company = await prisma.company.create({ data: { id: createId(), name: "Muster GmbH" } });
  await prisma.contact.create({
    data: {
      id: createId(),
      firstName: "Kunde",
      lastName: "Extern",
      email: "kunde@kunden-firma.invalid",
      companyId: company.id,
    },
  });
  await enableAll();
});

describe("reminder job", () => {
  it("creates reminders and mails only the assigned user, from the configured sender", async () => {
    await seedAllRules();
    const { mailer, sent } = makeMailer();
    const summary = await run(mailer);

    expect(summary).toMatchObject({ skipped: false, created: 5, sent: 5, failed: 0 });
    expect(sent).toHaveLength(5);
    for (const mail of sent) {
      expect(mail.toEmail).toBe(userA.email);
      expect(mail.fromEmail).toBe(FROM);
      expect(mail.fromName).toBe("RDEvolution CRM");
      expect(mail.textBody).toContain(BASE_URL);
      // Niemals Kunden-Adressen (Kontakt, Dokument-Empfänger).
      expect(`${mail.toEmail}${mail.subject}${mail.textBody}`).not.toContain("kunden-firma.de");
    }
    expect(sent.map((m) => m.subject).sort()).toEqual([
      "CRM-Erinnerung: Angebot ANG-2026-0001 noch offen",
      "CRM-Erinnerung: Aufgabe überfällig",
      "CRM-Erinnerung: Deal seit 20 Tagen ohne Aktivität",
      "CRM-Erinnerung: Follow-up überfällig",
      "CRM-Erinnerung: Rechnung RE-2026-0002 überfällig",
    ]);
    const rows = await prisma.reminder.findMany();
    expect(
      rows.every((r) => r.status === "SENT" && r.emailSentAt && r.assignedUserId === userA.id),
    ).toBe(true);
  });

  it("creates no Activity entries", async () => {
    await seedAllRules();
    await run(makeMailer().mailer);
    expect(await prisma.activity.count()).toBe(0);
  });

  it("does not send again on the second run", async () => {
    await seedAllRules();
    const { mailer, sent } = makeMailer();
    await run(mailer);
    const second = await run(mailer);
    const third = await run(mailer, { now: new Date(NOW.getTime() + DAY) });
    expect(second).toMatchObject({ created: 0, sent: 0 });
    expect(third.sent).toBe(0);
    expect(sent).toHaveLength(5);
    expect(await prisma.reminder.count()).toBe(5);
  });

  it("never double-sends under parallel execution", async () => {
    await seedAllRules();
    const { mailer, sent } = makeMailer();
    const results = await Promise.all([run(mailer), run(mailer), run(mailer)]);
    expect(sent).toHaveLength(5);
    expect(results.filter((r) => !r.skipped).length).toBeGreaterThanOrEqual(1);
    expect(await prisma.reminder.count()).toBe(5);
    expect(await prisma.reminder.count({ where: { status: "SENT" } })).toBe(5);
  });

  it("does nothing for disabled rules", async () => {
    await seedAllRules();
    const settings = await prisma.reminderSettings.findFirstOrThrow();
    await prisma.reminderSettings.update({
      where: { id: settings.id },
      data: {
        quoteEnabled: false,
        dealEnabled: false,
        followUpEnabled: false,
        taskEnabled: false,
        invoiceEnabled: false,
      },
    });
    const { mailer, sent } = makeMailer();
    expect(await run(mailer)).toMatchObject({ created: 0, sent: 0 });
    expect(sent).toHaveLength(0);
  });

  it("respects the quote/deal thresholds from the settings", async () => {
    await quote({ sentAt: ago(5) });
    await deal({ createdAt: ago(10) });
    const { mailer, sent } = makeMailer();
    await run(mailer);
    expect(sent).toHaveLength(0);
    const settings = await prisma.reminderSettings.findFirstOrThrow();
    await prisma.reminderSettings.update({
      where: { id: settings.id },
      data: { quoteDays: 5, dealDays: 10 },
    });
    await run(mailer);
    expect(sent).toHaveLength(2);
  });

  it("uses the last activity of a deal as the start point", async () => {
    const d = await deal();
    await prisma.activity.create({
      data: { id: createId(), type: "DEAL_UPDATED", dealId: d.id, createdAt: ago(3) },
    });
    const { mailer, sent } = makeMailer();
    await run(mailer);
    expect(sent).toHaveLength(0);
  });

  it("resolves reminders when the underlying state is done (no further mails)", async () => {
    const { q, d, l, t, i } = await seedAllRules();
    const { mailer, sent } = makeMailer();
    await run(mailer);
    await prisma.quote.update({ where: { id: q.id }, data: { status: "ACCEPTED" } });
    await prisma.deal.update({ where: { id: d.id }, data: { status: "WON" } });
    await prisma.lead.update({ where: { id: l.id }, data: { nextFollowUpAt: null } });
    await prisma.task.update({ where: { id: t.id }, data: { status: "COMPLETED" } });
    await prisma.invoice.update({ where: { id: i.id }, data: { status: "PAID" } });
    const summary = await run(mailer);
    expect(summary.resolved).toBe(5);
    expect(await prisma.reminder.count({ where: { status: "RESOLVED" } })).toBe(5);
    expect(sent).toHaveLength(5);
  });

  it("a changed follow-up date creates a new reminder (new state)", async () => {
    const l = await lead({ nextFollowUpAt: ago(2) });
    const { mailer, sent } = makeMailer();
    await run(mailer);
    await prisma.lead.update({ where: { id: l.id }, data: { nextFollowUpAt: ago(1) } });
    const summary = await run(mailer);
    expect(summary).toMatchObject({ created: 1, resolved: 1, sent: 1 });
    expect(sent).toHaveLength(2);
  });

  it("does not create reminders for soft-deleted entities and resolves open ones", async () => {
    const t = await task();
    await task({ deletedAt: new Date() });
    await deal({ deletedAt: new Date() });
    const { mailer, sent } = makeMailer();
    await run(mailer);
    expect(sent).toHaveLength(1);
    await prisma.task.update({ where: { id: t.id }, data: { deletedAt: new Date() } });
    const summary = await run(mailer);
    expect(summary.resolved).toBe(1);
    expect(await prisma.reminder.count({ where: { status: { not: "RESOLVED" } } })).toBe(0);
  });
});

describe("assignee handling", () => {
  it("no assignee: internal hint only, no mail; assigning later sends to the new user", async () => {
    const l = await lead({ assignedUserId: null });
    const { mailer, sent } = makeMailer();
    const first = await run(mailer);
    expect(first).toMatchObject({ created: 1, sent: 0, noAssignee: 1 });
    expect((await prisma.reminder.findFirstOrThrow()).status).toBe("NO_ASSIGNEE");
    expect(sent).toHaveLength(0);

    await prisma.lead.update({ where: { id: l.id }, data: { assignedUserId: userB.id } });
    await run(mailer);
    expect(sent).toHaveLength(1);
    expect(sent[0].toEmail).toBe(userB.email);
  });

  it("inactive assignee: no mail, visible as such; reactivation sends", async () => {
    await task({ assignedUserId: inactive.id });
    const { mailer, sent } = makeMailer();
    const first = await run(mailer);
    expect(first).toMatchObject({ created: 1, sent: 0, inactiveAssignee: 1 });
    expect((await prisma.reminder.findFirstOrThrow()).status).toBe("INACTIVE_ASSIGNEE");
    expect(sent).toHaveLength(0);

    await prisma.user.update({ where: { id: inactive.id }, data: { isActive: true } });
    await run(mailer);
    expect(sent).toHaveLength(1);
    expect(sent[0].toEmail).toBe(inactive.email);
  });

  it("assignee change: unsent reminders move to the new user, sent ones stay history", async () => {
    const t = await task();
    const l = await lead({ nextFollowUpAt: ago(2) });
    const { mailer: failing } = makeMailer({ fail: true });
    await run(failing); // beide FAILED (an A), nichts gesendet
    await prisma.task.update({ where: { id: t.id }, data: { assignedUserId: userB.id } });
    const { mailer, sent } = makeMailer();
    await run(mailer);
    expect(sent.find((m) => m.subject.includes("Aufgabe"))?.toEmail).toBe(userB.email);
    expect(sent.find((m) => m.subject.includes("Follow-up"))?.toEmail).toBe(userA.email);

    // Gesendeter Reminder bleibt bei A; neuer Zustand geht an B.
    await prisma.lead.update({
      where: { id: l.id },
      data: { assignedUserId: userB.id, nextFollowUpAt: ago(1) },
    });
    await run(mailer);
    const history = await prisma.reminder.findMany({
      where: { leadId: l.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((r) => r.assignedUserId)).toEqual([userA.id, userB.id]);
    expect(sent.at(-1)?.toEmail).toBe(userB.email);
  });
});

describe("failures, retry and limits", () => {
  it("SMTP failure marks FAILED without leaking details; a later run retries", async () => {
    await task();
    const failing = makeMailer({ fail: true });
    const first = await run(failing.mailer);
    expect(first).toMatchObject({ failed: 1, sent: 0 });
    const row = await prisma.reminder.findFirstOrThrow();
    expect(row).toMatchObject({ status: "FAILED", attempts: 1, lastError: "SMTP_DOWN" });
    expect(row.lastError).not.toContain("secret");

    const ok = makeMailer();
    await run(ok.mailer);
    expect(ok.sent).toHaveLength(1);
    expect(await prisma.reminder.findFirstOrThrow()).toMatchObject({
      status: "SENT",
      attempts: 2,
      lastError: null,
    });
  });

  it("stops retrying after the maximum number of attempts", async () => {
    await task();
    const failing = makeMailer({ fail: true });
    for (let n = 0; n < 5; n++) await run(failing.mailer);
    expect((await prisma.reminder.findFirstOrThrow()).attempts).toBe(3);
  });

  it("aborts sending after consecutive SMTP failures instead of hammering the server", async () => {
    for (let n = 0; n < 6; n++) await task({ dueAt: ago(n + 1) });
    let calls = 0;
    const { mailer } = makeMailer({ fail: () => (calls++, true) });
    const summary = await run(mailer);
    expect(calls).toBe(3);
    expect(summary.failed).toBe(3);
    expect(summary.pendingLeft).toBe(3);
  });

  it("applies the batch limit (no mail flood)", async () => {
    for (let n = 0; n < 5; n++) await task({ dueAt: ago(n + 1) });
    const { mailer, sent } = makeMailer();
    const summary = await run(mailer, { batchLimit: 2 });
    expect(summary).toMatchObject({ created: 5, sent: 2, pendingLeft: 3 });
    expect(sent).toHaveLength(2);
    await run(mailer, { batchLimit: 10 });
    expect(sent).toHaveLength(5);
  });

  it("a job that finds the lock taken exits without sending", async () => {
    await task();
    const { mailer, sent } = makeMailer();
    const lockHolder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(620014)`;
        const result = await run(mailer);
        return result;
      },
      { timeout: 20000 },
    );
    const result = await lockHolder;
    // Der geschachtelte Lauf nutzt eine andere Verbindung und sieht die Sperre.
    expect(result.skipped).toBe(true);
    expect(sent).toHaveLength(0);
  });
});

describe("dashboard visibility, dismiss and settings access", () => {
  it("USER sees only own reminders; OWNER/ADMIN see all incl. missing assignee", async () => {
    await task();
    await task({ assignedUserId: userB.id, dueAt: ago(2) });
    await lead({ assignedUserId: null });
    await run(makeMailer().mailer);

    const asA = await listAttentionReminders({ id: userA.id, role: "USER" });
    expect(asA.total).toBe(1);
    const asOwner = await listAttentionReminders({ id: userB.id, role: "OWNER" });
    expect(asOwner.total).toBe(3);
    expect(asOwner.items.some((i) => i.status === "NO_ASSIGNEE")).toBe(true);
  });

  it("dismissing a reminder does not change the underlying record and is not re-created", async () => {
    const q = await quote();
    const { mailer, sent } = makeMailer();
    await run(mailer);
    const reminder = await prisma.reminder.findFirstOrThrow();
    const { dismissReminderAction } = await import("@/modules/reminders/actions");
    const owner = await prisma.user.update({ where: { id: userA.id }, data: { role: "OWNER" } });
    authMock.mockResolvedValue({ user: { id: owner.id, authVersion: owner.authVersion } });
    const form = new FormData();
    form.set("id", reminder.id);
    await dismissReminderAction(form);
    expect((await prisma.reminder.findFirstOrThrow()).status).toBe("RESOLVED");
    expect((await prisma.quote.findFirstOrThrow({ where: { id: q.id } })).status).toBe("SENT");
    await run(mailer);
    expect(await prisma.reminder.count()).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("a USER cannot dismiss someone else's reminder", async () => {
    await task({ assignedUserId: userB.id });
    await run(makeMailer().mailer);
    const reminder = await prisma.reminder.findFirstOrThrow();
    const { dismissReminderAction } = await import("@/modules/reminders/actions");
    authMock.mockResolvedValue({
      user: {
        id: userA.id,
        authVersion:
          userA.id &&
          (await prisma.user.findUniqueOrThrow({ where: { id: userA.id } })).authVersion,
      },
    });
    const form = new FormData();
    form.set("id", reminder.id);
    await dismissReminderAction(form);
    expect((await prisma.reminder.findFirstOrThrow()).status).toBe("SENT");
  });

  it("settings can only be changed with SETTINGS_MANAGE (OWNER); changes are audited", async () => {
    const { updateReminderSettingsAction } = await import("@/modules/reminders/actions");
    const form = new FormData();
    form.set("quoteEnabled", "on");
    form.set("quoteDays", "10");
    form.set("dealDays", "21");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    authMock.mockResolvedValue({ user: { id: user.id, authVersion: user.authVersion } });
    await expect(updateReminderSettingsAction({ error: null }, form)).rejects.toBeDefined();

    const owner = await prisma.user.update({ where: { id: userA.id }, data: { role: "OWNER" } });
    authMock.mockResolvedValue({ user: { id: owner.id, authVersion: owner.authVersion } });
    expect(await updateReminderSettingsAction({ error: null }, form)).toMatchObject({
      error: null,
      saved: true,
    });
    const saved = await prisma.reminderSettings.findFirstOrThrow();
    expect(saved).toMatchObject({
      quoteEnabled: true,
      quoteDays: 10,
      dealEnabled: false,
      dealDays: 21,
      taskEnabled: false,
    });
    expect(await prisma.auditLog.count({ where: { action: "REMINDER_SETTINGS_UPDATED" } })).toBe(1);

    form.set("quoteDays", "0");
    expect((await updateReminderSettingsAction({ error: null }, form)).error).toBeTruthy();
  });

  it("unauthenticated users have no session", async () => {
    const { getCurrentUser } = await import("@/server/rbac");
    authMock.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });
});
