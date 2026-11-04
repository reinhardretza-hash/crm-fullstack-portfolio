import { describe, expect, it } from "vitest";
import { taskFormSchema, taskFiltersSchema } from "@/validations/task";
import { assertAtMostOneCrmTarget } from "@/modules/tasks/validation";

function baseFields() {
  return {
    title: "Kunde nachfassen",
    assignedUserId: "user-1",
    dueDate: "2026-07-01",
  };
}

describe("taskFormSchema - required fields", () => {
  it("rejects a task without a title", () => {
    expect(taskFormSchema.safeParse({ ...baseFields(), title: "" }).success).toBe(false);
  });

  it("rejects a task without an assigned user", () => {
    expect(taskFormSchema.safeParse({ ...baseFields(), assignedUserId: "" }).success).toBe(false);
  });

  it("rejects a task without a due date", () => {
    expect(taskFormSchema.safeParse({ ...baseFields(), dueDate: "" }).success).toBe(false);
  });

  it("accepts a task with only the required fields - no CRM target needed", () => {
    const result = taskFormSchema.safeParse(baseFields());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.companyId).toBeUndefined();
      expect(result.data.contactId).toBeUndefined();
      expect(result.data.leadId).toBeUndefined();
      expect(result.data.dealId).toBeUndefined();
    }
  });

  it("defaults status to OPEN and priority to NORMAL", () => {
    const result = taskFormSchema.safeParse(baseFields());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("OPEN");
      expect(result.data.priority).toBe("NORMAL");
    }
  });
});

describe("taskFormSchema - at most one CRM target", () => {
  it("accepts exactly one target (e.g. companyId)", () => {
    expect(taskFormSchema.safeParse({ ...baseFields(), companyId: "company-1" }).success).toBe(
      true,
    );
  });

  it("rejects two targets set at the same time", () => {
    const result = taskFormSchema.safeParse({
      ...baseFields(),
      companyId: "company-1",
      leadId: "lead-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects all four targets set at the same time", () => {
    const result = taskFormSchema.safeParse({
      ...baseFields(),
      companyId: "company-1",
      contactId: "contact-1",
      leadId: "lead-1",
      dealId: "deal-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("taskFormSchema - due date (UTC storage, Europe/Berlin end-of-day default)", () => {
  it("defaults to 23:59:59 Berlin when no time is given", () => {
    const result = taskFormSchema.safeParse(baseFields());
    expect(result.success).toBe(true);
    if (result.success) {
      // 2026-07-01 ist Sommerzeit (UTC+2) -> 23:59:59 Berlin = 21:59:59 UTC.
      expect(result.data.dueAt.toISOString()).toBe("2026-07-01T21:59:59.000Z");
    }
  });

  it("uses the given time when provided", () => {
    const result = taskFormSchema.safeParse({ ...baseFields(), dueTime: "09:00" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueAt.toISOString()).toBe("2026-07-01T07:00:00.000Z");
    }
  });
});

describe("taskFormSchema - reminder must not be after due", () => {
  it("accepts a reminder before the due date", () => {
    const result = taskFormSchema.safeParse({ ...baseFields(), reminderDate: "2026-06-25" });
    expect(result.success).toBe(true);
  });

  it("accepts a reminder exactly at the due date/time", () => {
    const result = taskFormSchema.safeParse({
      ...baseFields(),
      dueTime: "09:00",
      reminderDate: "2026-07-01",
      reminderTime: "09:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a reminder after the due date", () => {
    const result = taskFormSchema.safeParse({ ...baseFields(), reminderDate: "2026-07-05" });
    expect(result.success).toBe(false);
  });
});

describe("assertAtMostOneCrmTarget (pure Funktion)", () => {
  it("does not throw with zero targets", () => {
    expect(() => assertAtMostOneCrmTarget({})).not.toThrow();
  });

  it("does not throw with exactly one target", () => {
    expect(() => assertAtMostOneCrmTarget({ leadId: "lead-1" })).not.toThrow();
  });

  it("throws with two targets", () => {
    expect(() => assertAtMostOneCrmTarget({ leadId: "lead-1", dealId: "deal-1" })).toThrow();
  });
});

describe("taskFiltersSchema", () => {
  it("defaults to view=open, sort=dueAt, direction=asc", () => {
    const filters = taskFiltersSchema.parse({});
    expect(filters.view).toBe("open");
    expect(filters.sort).toBe("dueAt");
    expect(filters.direction).toBe("asc");
  });
});
