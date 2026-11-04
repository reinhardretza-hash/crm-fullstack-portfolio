import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVITY_CATEGORY_BY_TYPE,
  ACTIVITY_LABELS,
  describeActivityDetail,
  safeActivityMetadata,
} from "@/modules/activity/catalog";
import {
  NEXT_STEP_PRIORITY,
  pickNextStep,
  sortNextSteps,
  type NextStepItem,
} from "@/modules/customer-file/next-step";
import { parseTab, scopeIdField, scopeQuery, scopeWhere } from "@/modules/customer-file/scope";
import {
  resolveStoredPath,
  getUploadDir,
  StorageNotConfiguredError,
} from "@/modules/files/storage";
import {
  canDeleteFile,
  contentDisposition,
  fileExtension,
  fileTargetSchema,
  formatFileSize,
  MAX_FILE_BYTES,
  newStoredName,
  safeDisplayName,
  STORED_NAME_PATTERN,
  validateUpload,
} from "@/modules/files/validation";
import { callLogSchema } from "@/validations/call";

const bytes = (...values: number[]) =>
  new Uint8Array([...values, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47);
const JPG = bytes(0xff, 0xd8, 0xff);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);

describe("next step prioritisation", () => {
  const at = (iso: string) => new Date(iso);
  const item = (kind: NextStepItem["kind"], title: string, when: string | null): NextStepItem => ({
    kind,
    title,
    href: null,
    at: when ? at(when) : null,
  });

  it("orders: overdue task > due follow-up > event > reminder > upcoming follow-up > upcoming task", () => {
    const sorted = sortNextSteps([
      item("TASK_UPCOMING", "t2", "2026-06-01"),
      item("REMINDER", "r", null),
      item("EVENT", "e", "2026-05-20"),
      item("FOLLOW_UP_DUE", "f", "2026-05-15"),
      item("TASK_OVERDUE", "t1", "2026-05-10"),
      item("FOLLOW_UP_UPCOMING", "fu", "2026-05-25"),
    ]);
    expect(sorted.map((i) => i.title)).toEqual(["t1", "f", "e", "r", "fu", "t2"]);
    expect(Object.values(NEXT_STEP_PRIORITY).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("sorts the same kind by date and picks primary plus a few others", () => {
    const { primary, others, total } = pickNextStep(
      [
        item("TASK_OVERDUE", "later", "2026-05-12"),
        item("TASK_OVERDUE", "earliest", "2026-05-01"),
        item("EVENT", "e1", "2026-06-01"),
        item("EVENT", "e2", "2026-06-02"),
        item("EVENT", "e3", "2026-06-03"),
      ],
      2,
    );
    expect(primary?.title).toBe("earliest");
    expect(others.map((i) => i.title)).toEqual(["later", "e1"]);
    expect(total).toBe(5);
  });

  it("returns no primary for an empty list", () => {
    expect(pickNextStep([])).toEqual({ primary: null, others: [], total: 0 });
  });
});

describe("scope helpers", () => {
  it("maps scopes to FK fields, filters and create-flow queries", () => {
    expect(scopeIdField({ kind: "company", id: "c" })).toBe("companyId");
    expect(scopeIdField({ kind: "contact", id: "k" })).toBe("contactId");
    expect(scopeWhere({ kind: "deal", id: "d" })).toEqual({ dealId: "d" });
    expect(scopeQuery({ kind: "deal", id: "d" }, { assignedUserId: "u", empty: null })).toBe(
      "dealId=d&assignedUserId=u",
    );
  });
  it("only accepts known tabs", () => {
    const allowed = ["overview", "history", "files"] as const;
    expect(parseTab("files", allowed)).toBe("files");
    expect(parseTab(["history"], allowed)).toBe("history");
    expect(parseTab("sales", allowed)).toBe("overview");
    expect(parseTab("<script>", allowed)).toBe("overview");
    expect(parseTab(undefined, allowed)).toBe("overview");
  });
});

describe("upload validation", () => {
  const ok = (name: string, type: string, head: Uint8Array, size = 1000) =>
    validateUpload({ name, declaredType: type, size, head });

  it("accepts the allowed formats with matching MIME and content", () => {
    expect(ok("Angebot.pdf", "application/pdf", PDF)).toMatchObject({ ok: true, ext: "pdf" });
    expect(ok("Logo.PNG", "image/png", PNG)).toMatchObject({ ok: true, ext: "png" });
    expect(ok("foto.jpeg", "image/jpeg", JPG)).toMatchObject({ ok: true, mime: "image/jpeg" });
    expect(
      ok(
        "Vertrag.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ZIP,
      ),
    ).toMatchObject({ ok: true });
    expect(
      ok("Tabelle.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ZIP),
    ).toMatchObject({ ok: true });
    expect(ok("notiz.txt", "text/plain", new Uint8Array([0x68, 0x69]))).toMatchObject({ ok: true });
  });

  it("accepts a missing declared MIME type and strips parameters", () => {
    expect(ok("a.pdf", "", PDF).ok).toBe(true);
    expect(ok("a.txt", "text/plain; charset=utf-8", new Uint8Array([0x61])).ok).toBe(true);
  });

  it("blocks a wrong MIME type, wrong content and disallowed extensions", () => {
    expect(ok("a.pdf", "image/png", PDF).ok).toBe(false);
    expect(ok("a.pdf", "application/octet-stream", PDF).ok).toBe(false);
    expect(ok("a.pdf", "application/pdf", PNG).ok).toBe(false); // umbenanntes PNG
    expect(ok("a.png", "image/png", PDF).ok).toBe(false);
    for (const name of [
      "a.exe",
      "a.svg",
      "a.html",
      "a.js",
      "a.php",
      "a.zip",
      "a.pdf.exe",
      "noext",
    ]) {
      expect(ok(name, "", PDF).ok).toBe(false);
    }
    expect(ok("a.txt", "text/plain", new Uint8Array([0x61, 0x00, 0x62])).ok).toBe(false); // Binär als txt
  });

  it("enforces the size limit and rejects empty files", () => {
    expect(ok("a.pdf", "application/pdf", PDF, MAX_FILE_BYTES).ok).toBe(true);
    expect(ok("a.pdf", "application/pdf", PDF, MAX_FILE_BYTES + 1)).toMatchObject({ ok: false });
    expect(ok("a.pdf", "application/pdf", PDF, 0).ok).toBe(false);
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("safe file names", () => {
  it("strips paths, control characters and risky characters from the display name", () => {
    expect(safeDisplayName("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(safeDisplayName("C:\\Users\\x\\Vertrag final.pdf")).toBe("Vertrag final.pdf");
    expect(safeDisplayName('a"b<c>|d:e*f?.pdf')).toBe("abcdef.pdf");
    expect(safeDisplayName("tab\tname\r\n.pdf")).toBe("tabname.pdf");
    expect(safeDisplayName("   .pdf")).toBe("Datei.pdf");
    expect(safeDisplayName(`${"x".repeat(300)}.pdf`)).toHaveLength(124);
    expect(fileExtension("a.b.PDF")).toBe("pdf");
    expect(fileExtension(".hidden")).toBe("");
  });

  it("generates random internal names that never contain the original name", () => {
    const a = newStoredName("pdf");
    const b = newStoredName("pdf");
    expect(a).toMatch(STORED_NAME_PATTERN);
    expect(a).not.toBe(b);
  });

  it("builds a safe attachment header with a UTF-8 filename", () => {
    const header = contentDisposition('Käse "Angebot".pdf');
    expect(header.startsWith("attachment;")).toBe(true);
    expect(header).toContain("filename*=UTF-8''K%C3%A4se%20%22Angebot%22.pdf");
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).not.toContain('"Angebot"');
  });
});

describe("storage paths", () => {
  const original = process.env.CRM_UPLOAD_DIR;
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (original === undefined) delete process.env.CRM_UPLOAD_DIR;
    else process.env.CRM_UPLOAD_DIR = original;
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  });

  it("resolves only generated names inside the upload directory", () => {
    process.env.CRM_UPLOAD_DIR = path.resolve("/tmp/crm-test-uploads");
    const name = newStoredName("pdf");
    expect(resolveStoredPath(name)).toBe(path.resolve("/tmp/crm-test-uploads", name));
    for (const bad of ["../x.pdf", "..\\x.pdf", "/etc/passwd", "a.pdf", `${name}/../../x`, ""]) {
      expect(() => resolveStoredPath(bad)).toThrow();
    }
  });

  it("requires an explicit absolute directory in production", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.CRM_UPLOAD_DIR;
    expect(() => getUploadDir()).toThrow(StorageNotConfiguredError);
    process.env.CRM_UPLOAD_DIR = "relative/path";
    expect(() => getUploadDir()).toThrow(StorageNotConfiguredError);
  });
});

describe("file target and permissions", () => {
  it("requires exactly one target", () => {
    expect(fileTargetSchema.safeParse({ companyId: "c" }).success).toBe(true);
    expect(fileTargetSchema.safeParse({}).success).toBe(false);
    expect(fileTargetSchema.safeParse({ companyId: "c", dealId: "d" }).success).toBe(false);
    expect(
      fileTargetSchema.safeParse({ companyId: "c", contactId: "k", dealId: "d" }).success,
    ).toBe(false);
  });

  it("allows deleting for the uploader and OWNER/ADMIN only", () => {
    const file = { uploadedByUserId: "u1" };
    expect(canDeleteFile({ id: "u1", role: "USER" }, file)).toBe(true);
    expect(canDeleteFile({ id: "u2", role: "USER" }, file)).toBe(false);
    expect(canDeleteFile({ id: "u2", role: "ADMIN" }, file)).toBe(true);
    expect(canDeleteFile({ id: "u2", role: "OWNER" }, file)).toBe(true);
  });

  it("formats sizes compactly", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5,0 MB");
  });
});

describe("call log", () => {
  const base = { companyId: "c1", outcome: "REACHED" };
  it("validates target, outcome, duration and follow-up date", () => {
    expect(callLogSchema.safeParse(base).success).toBe(true);
    expect(
      callLogSchema.safeParse({
        ...base,
        durationMinutes: "12",
        note: "ok",
        followUpDate: "2026-06-01",
      }).success,
    ).toBe(true);
    expect(callLogSchema.safeParse({ outcome: "REACHED" }).success).toBe(false); // kein Ziel
    expect(callLogSchema.safeParse({ ...base, dealId: "d1" }).success).toBe(false); // zwei Ziele
    expect(callLogSchema.safeParse({ companyId: "c1" }).success).toBe(false); // kein Ergebnis
    expect(callLogSchema.safeParse({ ...base, outcome: "SPAM" }).success).toBe(false);
    for (const durationMinutes of ["0", "601", "x", "1.5"]) {
      expect(callLogSchema.safeParse({ ...base, durationMinutes }).success).toBe(false);
    }
    expect(callLogSchema.safeParse({ ...base, followUpDate: "2026-02-30" }).success).toBe(false);
    expect(callLogSchema.safeParse({ ...base, note: "x".repeat(201) }).success).toBe(false);
  });

  it("treats empty optional fields as absent", () => {
    const parsed = callLogSchema.parse({
      ...base,
      durationMinutes: "",
      note: "",
      followUpDate: "",
    });
    expect(parsed.durationMinutes).toBeUndefined();
    expect(parsed.note).toBeUndefined();
    expect(parsed.followUpDate).toBeUndefined();
  });

  it("has a label, a communication category and a readable, safe detail text", () => {
    expect(ACTIVITY_LABELS.CALL_LOGGED).toBe("Anruf dokumentiert");
    expect(ACTIVITY_CATEGORY_BY_TYPE.CALL_LOGGED).toBe("COMMUNICATION");
    expect(
      describeActivityDetail("CALL_LOGGED", {
        callOutcome: "CALLBACK",
        durationMinutes: 12,
        callNote: "Angebot besprochen",
        nextStep: "Angebot senden",
        password: "geheim",
      }),
    ).toBe("Rückruf vereinbart · 12 Min. · Angebot besprochen · Nächster Schritt: Angebot senden");
    expect(describeActivityDetail("CALL_LOGGED", {})).toBeNull();
    const safe = safeActivityMetadata({ callOutcome: "BOGUS", durationMinutes: 9999, secret: "x" });
    expect(safe.callOutcome).toBeUndefined();
    expect(safe.durationMinutes).toBeUndefined();
    expect(JSON.stringify(safe)).not.toContain("secret");
  });
});
