import { describe, expect, it } from "vitest";
import { buildReminderMail, pluralDays, reminderUrl } from "@/modules/reminders/mail";
import {
  calendarDaysSince,
  dealReferenceDate,
  dedupeKey,
  evaluateDeal,
  evaluateFollowUp,
  evaluateInvoice,
  evaluateQuote,
  evaluateTask,
  resolveAssignee,
  type ReminderMailData,
} from "@/modules/reminders/rules";
import { reminderSettingsSchema } from "@/validations/reminder";

// Freitag, 15.05.2026 12:00 Berlin.
const NOW = new Date("2026-05-15T10:00:00Z");
const d = (value: string) => new Date(value);

describe("calendarDaysSince (Berlin calendar days)", () => {
  it("counts Berlin days, also across the DST switch", () => {
    expect(calendarDaysSince(d("2026-05-08T10:00:00Z"), NOW)).toBe(7);
    expect(calendarDaysSince(d("2026-05-15T03:00:00Z"), NOW)).toBe(0);
    // 22:30 UTC = 00:30 Berlin am Folgetag.
    expect(calendarDaysSince(d("2026-05-14T22:30:00Z"), NOW)).toBe(0);
    // Sommerzeit-Umstellung am 29.03.2026: 7 Kalendertage, obwohl nur 6d23h vergangen.
    expect(calendarDaysSince(d("2026-03-26T10:00:00Z"), d("2026-04-02T09:00:00Z"))).toBe(7);
  });
});

describe("quote rule", () => {
  const base = { status: "SENT" as const, validUntil: d("2026-06-30"), updatedAt: d("2026-05-01") };
  it("is due after N days, not before", () => {
    expect(evaluateQuote({ ...base, sentAt: d("2026-05-08T10:00:00Z") }, 7, NOW).due).toBe(true);
    expect(evaluateQuote({ ...base, sentAt: d("2026-05-09T10:00:00Z") }, 7, NOW).due).toBe(false);
  });
  it("ignores decided, cancelled, draft and expired quotes", () => {
    const sentAt = d("2026-05-01T10:00:00Z");
    for (const status of [
      "ACCEPTED",
      "REJECTED",
      "CANCELLED",
      "EXPIRED",
      "DRAFT",
      "READY",
    ] as const) {
      expect(evaluateQuote({ ...base, status, sentAt }, 7, NOW).due).toBe(false);
    }
    expect(evaluateQuote({ ...base, validUntil: d("2026-05-10"), sentAt }, 7, NOW).due).toBe(false);
  });
  it("falls back to updatedAt and keys the state by the reference time", () => {
    const result = evaluateQuote(
      { ...base, sentAt: null, updatedAt: d("2026-05-01T08:00:00Z") },
      7,
      NOW,
    );
    expect(result.due).toBe(true);
    expect(result.stateKey).toBe(`s${d("2026-05-01T08:00:00Z").getTime()}`);
  });
});

describe("deal inactivity rule", () => {
  const deal = { status: "OPEN" as const, createdAt: d("2026-04-20T10:00:00Z"), deletedAt: null };
  it("uses createdAt without activity and the last activity otherwise", () => {
    expect(evaluateDeal(deal, null, 14, NOW).due).toBe(true);
    expect(evaluateDeal(deal, d("2026-05-10T10:00:00Z"), 14, NOW).due).toBe(false);
    expect(dealReferenceDate(deal.createdAt, d("2026-05-10T10:00:00Z"))).toEqual(
      d("2026-05-10T10:00:00Z"),
    );
    expect(dealReferenceDate(deal.createdAt, null)).toEqual(deal.createdAt);
  });
  it("a new activity changes the state key", () => {
    const a = evaluateDeal(deal, null, 14, NOW).stateKey;
    const b = evaluateDeal(deal, d("2026-05-01T10:00:00Z"), 14, NOW).stateKey;
    expect(a).not.toBe(b);
  });
  it("ignores WON/LOST and soft-deleted deals", () => {
    expect(evaluateDeal({ ...deal, status: "WON" }, null, 14, NOW).due).toBe(false);
    expect(evaluateDeal({ ...deal, status: "LOST" }, null, 14, NOW).due).toBe(false);
    expect(evaluateDeal({ ...deal, deletedAt: NOW }, null, 14, NOW).due).toBe(false);
  });
});

describe("follow-up rule", () => {
  const lead = { status: "OPEN" as const, deletedAt: null };
  it("is due today and overdue, by Berlin day", () => {
    expect(evaluateFollowUp({ ...lead, nextFollowUpAt: d("2026-05-15T20:00:00Z") }, NOW).due).toBe(
      true,
    );
    expect(evaluateFollowUp({ ...lead, nextFollowUpAt: d("2026-05-10T08:00:00Z") }, NOW).due).toBe(
      true,
    );
    // 22:30 UTC = 00:30 Berlin am 16.05. -> noch nicht fällig.
    expect(evaluateFollowUp({ ...lead, nextFollowUpAt: d("2026-05-15T22:30:00Z") }, NOW).due).toBe(
      false,
    );
  });
  it("needs a date and an open, undeleted lead", () => {
    expect(evaluateFollowUp({ ...lead, nextFollowUpAt: null }, NOW).due).toBe(false);
    expect(
      evaluateFollowUp({ status: "WON", deletedAt: null, nextFollowUpAt: d("2026-05-10") }, NOW)
        .due,
    ).toBe(false);
    expect(
      evaluateFollowUp({ ...lead, deletedAt: NOW, nextFollowUpAt: d("2026-05-10") }, NOW).due,
    ).toBe(false);
  });
});

describe("task and invoice rules", () => {
  it("task: overdue only when not completed and due before now", () => {
    const task = { status: "OPEN" as const, dueAt: d("2026-05-15T09:00:00Z"), deletedAt: null };
    expect(evaluateTask(task, NOW).due).toBe(true);
    expect(evaluateTask({ ...task, dueAt: d("2026-05-15T11:00:00Z") }, NOW).due).toBe(false);
    expect(evaluateTask({ ...task, status: "COMPLETED" }, NOW).due).toBe(false);
    expect(evaluateTask({ ...task, status: "IN_PROGRESS" }, NOW).due).toBe(true);
    expect(evaluateTask({ ...task, deletedAt: NOW }, NOW).due).toBe(false);
  });
  it("invoice: effective OVERDUE only (SENT past due date or OVERDUE)", () => {
    const inv = { status: "SENT" as const, dueDate: d("2026-05-14"), deletedAt: null };
    expect(evaluateInvoice(inv, NOW).due).toBe(true);
    expect(evaluateInvoice({ ...inv, dueDate: d("2026-05-15") }, NOW).due).toBe(false);
    expect(evaluateInvoice({ ...inv, status: "OVERDUE" }, NOW).due).toBe(true);
    for (const status of ["PAID", "CANCELLED", "DRAFT", "READY"] as const) {
      expect(evaluateInvoice({ ...inv, status }, NOW).due).toBe(false);
    }
    expect(evaluateInvoice({ ...inv, deletedAt: NOW }, NOW).due).toBe(false);
    expect(evaluateInvoice(inv, NOW).stateKey).toBe("d2026-05-14");
  });
});

describe("assignee resolution and dedupe", () => {
  it("resolves OK / inactive / missing without any fallback", () => {
    const user = { id: "u1", email: "a@x.invalid", firstName: "Anna", isActive: true };
    expect(resolveAssignee(user)).toEqual({ status: "OK", user });
    expect(resolveAssignee({ ...user, isActive: false })).toEqual({
      status: "INACTIVE_ASSIGNEE",
      userId: "u1",
    });
    expect(resolveAssignee(null)).toEqual({ status: "NO_ASSIGNEE" });
    expect(resolveAssignee(undefined)).toEqual({ status: "NO_ASSIGNEE" });
  });
  it("builds a stable dedupe key per type, entity and state", () => {
    expect(dedupeKey("QUOTE_OPEN", "q1", "s1")).toBe("QUOTE_OPEN:q1:s1");
    expect(dedupeKey("QUOTE_OPEN", "q1", "s1")).toBe(dedupeKey("QUOTE_OPEN", "q1", "s1"));
    expect(dedupeKey("QUOTE_OPEN", "q1", "s2")).not.toBe(dedupeKey("QUOTE_OPEN", "q1", "s1"));
    expect(dedupeKey("TASK_OVERDUE", "q1", "s1")).not.toBe(dedupeKey("QUOTE_OPEN", "q1", "s1"));
  });
});

describe("reminder mail texts", () => {
  const url = "https://app.example.invalid/";
  const to = { firstName: "Alex" };
  const datas: ReminderMailData[] = [
    {
      type: "QUOTE_OPEN",
      id: "q1",
      quoteNumber: "ANG-2026-0012",
      companyName: "Muster GmbH",
      statusLabel: "Gesendet",
      sentAt: d("2026-05-08T10:00:00Z"),
      days: 7,
    },
    {
      type: "DEAL_INACTIVE",
      id: "d1",
      name: "Website Muster GmbH",
      companyName: "Muster GmbH",
      statusLabel: "Offen",
      lastActivityAt: d("2026-05-01T10:00:00Z"),
      days: 14,
    },
    { type: "FOLLOW_UP_DUE", id: "l1", title: "Lead A", companyName: "Muster GmbH", dueAt: NOW },
    {
      type: "TASK_OVERDUE",
      id: "t1",
      title: "Anrufen",
      dueAt: d("2026-05-10T10:00:00Z"),
      priority: "HIGH",
    },
    {
      type: "INVOICE_OVERDUE",
      id: "i1",
      invoiceNumber: "RE-2026-0042",
      companyName: "Muster GmbH",
      totalCents: 119000,
      dueDate: d("2026-05-01"),
    },
  ];

  it("builds subject, greeting and deep link for every type", () => {
    const [quote, deal, followUp, task, invoice] = datas.map((data) =>
      buildReminderMail(data, to, url, NOW),
    );
    expect(quote.subject).toBe("CRM-Erinnerung: Angebot ANG-2026-0012 noch offen");
    expect(quote.text).toContain("Hallo Alex,");
    expect(quote.text).toContain("seit 7 Tagen offen");
    expect(quote.text).toContain("Angebot öffnen: https://app.example.invalid/quotes/q1");
    expect(deal.subject).toBe("CRM-Erinnerung: Deal seit 14 Tagen ohne Aktivität");
    expect(deal.text).toContain("/deals/d1");
    expect(followUp.subject).toBe("CRM-Erinnerung: Follow-up heute fällig");
    expect(followUp.text).toContain("/leads/l1");
    expect(task.subject).toBe("CRM-Erinnerung: Aufgabe überfällig");
    expect(task.text).toContain("Priorität: Hoch");
    expect(invoice.subject).toBe("CRM-Erinnerung: Rechnung RE-2026-0042 überfällig");
    expect(invoice.text).toMatch(/Betrag: 1\.190,00\s€/);
    for (const mail of [quote, deal, followUp, task, invoice]) {
      expect(mail.text.endsWith("RDEvolution CRM")).toBe(true);
    }
  });

  it("uses singular for one day, marks overdue follow-ups and strips header injection", () => {
    expect(pluralDays(1)).toBe("1 Tag");
    expect(pluralDays(2)).toBe("2 Tagen");
    const overdue = buildReminderMail(
      {
        type: "FOLLOW_UP_DUE",
        id: "l1",
        title: "L",
        companyName: "C",
        dueAt: d("2026-05-10T10:00:00Z"),
      },
      to,
      url,
      NOW,
    );
    expect(overdue.subject).toBe("CRM-Erinnerung: Follow-up überfällig");
    const injected = buildReminderMail(
      {
        ...(datas[0] as Extract<ReminderMailData, { type: "QUOTE_OPEN" }>),
        quoteNumber: "A\r\nBcc: x@evil.invalid",
      },
      to,
      url,
      NOW,
    );
    expect(injected.subject).not.toMatch(/[\r\n]/);
    expect(reminderUrl("https://x.de///", datas[0])).toBe("https://x.de/quotes/q1");
  });

  it("never contains customer e-mail addresses (only link and internal data)", () => {
    for (const data of datas) {
      expect(buildReminderMail(data, to, url, NOW).text).not.toMatch(/@/);
    }
  });
});

describe("reminder settings validation", () => {
  it("parses checkboxes and day thresholds", () => {
    const parsed = reminderSettingsSchema.parse({
      quoteEnabled: "on",
      quoteDays: "7",
      dealEnabled: undefined,
      dealDays: "14",
      followUpEnabled: "on",
      taskEnabled: undefined,
      invoiceEnabled: "on",
    });
    expect(parsed).toMatchObject({
      quoteEnabled: true,
      dealEnabled: false,
      quoteDays: 7,
      dealDays: 14,
    });
  });
  it("rejects invalid day values", () => {
    for (const bad of ["0", "366", "x", "1.5", ""]) {
      expect(reminderSettingsSchema.safeParse({ quoteDays: bad, dealDays: "14" }).success).toBe(
        false,
      );
    }
  });
});
