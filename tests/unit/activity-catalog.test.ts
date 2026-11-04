import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CATEGORY_BY_TYPE,
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_LABELS,
  ACTIVITY_TYPES,
  activityTarget,
  activityTypesInCategory,
  activityTypesMatchingText,
  describeActivityDetail,
  isActivityType,
  safeActivityMetadata,
  type ActivityTargetSource,
} from "@/modules/activity/catalog";
import { buildActivityWhere } from "@/modules/activity/queries";
import { activityFiltersSchema } from "@/validations/activity";

const empty: Omit<ActivityTargetSource, "type" | "metadata"> = {
  company: null,
  contact: null,
  lead: null,
  deal: null,
  task: null,
  calendarEvent: null,
  quote: null,
  invoice: null,
};
const opts = { canViewEmails: true };

describe("activity labels and categories", () => {
  it("maps every ActivityType to a German label and a category", () => {
    for (const type of ACTIVITY_TYPES) {
      expect(ACTIVITY_LABELS[type]).toBeTruthy();
      expect(ACTIVITY_CATEGORY_LABELS[ACTIVITY_CATEGORY_BY_TYPE[type]]).toBeTruthy();
    }
    expect(ACTIVITY_LABELS.DEAL_WON).toBe("Deal gewonnen");
  });

  it("derives categories from the type", () => {
    expect(ACTIVITY_CATEGORY_BY_TYPE.DEAL_CREATED).toBe("SALES");
    expect(ACTIVITY_CATEGORY_BY_TYPE.LEAD_WON).toBe("SALES");
    expect(ACTIVITY_CATEGORY_BY_TYPE.EMAIL_SENT).toBe("COMMUNICATION");
    expect(ACTIVITY_CATEGORY_BY_TYPE.NOTE_ADDED).toBe("COMMUNICATION");
    expect(ACTIVITY_CATEGORY_BY_TYPE.TASK_COMPLETED).toBe("TASKS");
    expect(ACTIVITY_CATEGORY_BY_TYPE.CALENDAR_EVENT_RESCHEDULED).toBe("CALENDAR");
    expect(ACTIVITY_CATEGORY_BY_TYPE.QUOTE_SENT).toBe("QUOTES");
    expect(ACTIVITY_CATEGORY_BY_TYPE.INVOICE_PAID).toBe("INVOICES");
    expect(ACTIVITY_CATEGORY_BY_TYPE.COMPANY_CREATED).toBe("MASTER_DATA");
    expect(ACTIVITY_CATEGORY_BY_TYPE.CONTACT_UPDATED).toBe("MASTER_DATA");
    expect(activityTypesInCategory("INVOICES")).toContain("INVOICE_CREATED");
    expect(activityTypesInCategory("INVOICES")).not.toContain("QUOTE_CREATED");
  });

  it("validates type strings and matches label text", () => {
    expect(isActivityType("DEAL_WON")).toBe(true);
    expect(isActivityType("toString")).toBe(false);
    expect(activityTypesMatchingText("gewonnen").sort()).toEqual(["DEAL_WON", "LEAD_WON"]);
    expect(activityTypesMatchingText("  ")).toEqual([]);
  });
});

describe("safeActivityMetadata / describeActivityDetail", () => {
  it("never exposes secrets, addresses or unknown keys", () => {
    const safe = safeActivityMetadata({
      password: "geheim",
      smtpPass: "geheim",
      toEmail: "kunde@example.com",
      stack: "Error at ...",
      invoiceNumber: "RE-2026-0001",
    });
    expect(safe).toEqual(expect.objectContaining({ invoiceNumber: "RE-2026-0001" }));
    expect(JSON.stringify(safe)).not.toMatch(/geheim|kunde@|Error at/);
    expect(Object.keys(safe)).not.toContain("password");
  });

  it("tolerates garbage input and truncates long text", () => {
    expect(safeActivityMetadata(null)).toEqual({});
    expect(safeActivityMetadata("x")).toEqual({});
    expect(safeActivityMetadata([1])).toEqual({});
    expect(safeActivityMetadata({ subject: "a".repeat(500) }).subject).toHaveLength(200);
    expect(safeActivityMetadata({ startsAt: "kein datum" }).startsAt).toBeUndefined();
    expect(safeActivityMetadata({ lostReason: "BOGUS" }).lostReason).toBeUndefined();
  });

  it("builds readable descriptions", () => {
    expect(describeActivityDetail("INVOICE_CREATED", { invoiceNumber: "RE-1" })).toBe("RE-1");
    expect(describeActivityDetail("QUOTE_SENT", { quoteNumber: "AN-1" })).toBe("AN-1");
    expect(
      describeActivityDetail("LEAD_STAGE_CHANGED", { fromStageName: "Neu", toStageName: "Termin" }),
    ).toBe('"Neu" → "Termin"');
    expect(describeActivityDetail("EMAIL_SENT", { subject: "Hallo", toEmail: "a@b.invalid" })).toBe(
      "Hallo",
    );
    expect(describeActivityDetail("NOTE_ADDED", { subject: "x" })).toBeNull();
    expect(describeActivityDetail("CALENDAR_EVENT_CREATED", { title: "Demo" })).toBe("Demo");
    expect(describeActivityDetail("COMPANY_CREATED", {})).toBeNull();
    expect(describeActivityDetail("DEAL_LOST", { lostReason: "PRICE" })).toMatch(/^Grund: /);
  });
});

describe("activityTarget (deep links)", () => {
  const live = { id: "x1", deletedAt: null };

  it("links each type to its detail page", () => {
    const cases: [ActivityTargetSource, string][] = [
      [
        { ...empty, type: "COMPANY_CREATED", metadata: null, company: { ...live, name: "A" } },
        "/companies/x1",
      ],
      [
        {
          ...empty,
          type: "CONTACT_CREATED",
          metadata: null,
          contact: { ...live, firstName: "A", lastName: "B" },
        },
        "/contacts/x1",
      ],
      [
        { ...empty, type: "LEAD_CREATED", metadata: null, lead: { ...live, title: "L" } },
        "/leads/x1",
      ],
      [{ ...empty, type: "DEAL_WON", metadata: null, deal: { ...live, name: "D" } }, "/deals/x1"],
      [
        { ...empty, type: "TASK_CREATED", metadata: null, task: { ...live, title: "T" } },
        "/tasks/x1",
      ],
      [
        {
          ...empty,
          type: "CALENDAR_EVENT_CREATED",
          metadata: null,
          calendarEvent: { ...live, title: "E" },
        },
        "/calendar/x1",
      ],
      [
        { ...empty, type: "QUOTE_SENT", metadata: null, quote: { ...live, quoteNumber: "AN-1" } },
        "/quotes/x1",
      ],
      [
        {
          ...empty,
          type: "INVOICE_PAID",
          metadata: null,
          invoice: { ...live, invoiceNumber: "RE-1" },
        },
        "/invoices/x1",
      ],
      [
        { ...empty, type: "EMAIL_SENT", metadata: { emailMessageId: "m1", subject: "S" } },
        "/emails/m1",
      ],
    ];
    for (const [source, href] of cases) {
      expect(activityTarget(source, opts)?.href).toBe(href);
    }
  });

  it("returns no link for a soft-deleted target but keeps the label", () => {
    const target = activityTarget(
      {
        ...empty,
        type: "DEAL_CREATED",
        metadata: null,
        deal: { id: "d1", deletedAt: new Date(), name: "Altes Deal" },
      },
      opts,
    );
    expect(target).toMatchObject({ label: "Altes Deal", href: null, deleted: true });
  });

  it("falls back to another context and returns null when nothing is linked", () => {
    const target = activityTarget(
      { ...empty, type: "NOTE_ADDED", metadata: null, company: { ...live, name: "Firma" } },
      opts,
    );
    expect(target?.href).toBe("/companies/x1");
    expect(activityTarget({ ...empty, type: "NOTE_ADDED", metadata: null }, opts)).toBeNull();
  });

  it("hides the email link without permission or message id", () => {
    const source = { ...empty, type: "EMAIL_SENT" as const, metadata: { emailMessageId: "m1" } };
    expect(activityTarget(source, { canViewEmails: false })?.href).toBeNull();
    expect(activityTarget({ ...source, metadata: {} }, opts)).toBeNull();
  });
});

describe("filter mapping", () => {
  it("ignores invalid values", () => {
    const f = activityFiltersSchema.parse({
      type: "BOGUS",
      category: "X",
      dateFrom: "kaputt",
      q: " ",
    });
    expect(f).toMatchObject({
      type: undefined,
      category: undefined,
      dateFrom: undefined,
      q: undefined,
    });
    expect(buildActivityWhere(f)).toEqual({});
  });

  it("maps filters to a where clause", () => {
    const f = activityFiltersSchema.parse({
      type: "DEAL_WON",
      category: "SALES",
      userId: "u1",
      dealId: "d1",
      leadId: "l1",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
    expect(f.dateFrom!.getTime()).toBeLessThan(f.dateTo!.getTime());
    const where = JSON.stringify(buildActivityWhere(f));
    expect(where).toContain('"type":"DEAL_WON"');
    expect(where).toContain('"userId":"u1"');
    expect(where).toContain('"dealId":"d1"');
    expect(where).toContain('"leadId":"l1"');
    expect(where).toContain("createdAt");
  });

  it("company filter also matches via deal, lead, quote and invoice", () => {
    const where = JSON.stringify(
      buildActivityWhere(activityFiltersSchema.parse({ companyId: "c1" })),
    );
    for (const relation of ["companyId", "lead", "deal", "quote", "invoice"]) {
      expect(where).toContain(relation);
    }
  });

  it("never filters out soft-deleted targets", () => {
    const where = JSON.stringify(buildActivityWhere(activityFiltersSchema.parse({ q: "x" })));
    expect(where).not.toContain("deletedAt");
  });
});
