import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import {
  canAccessAdministration,
  hasPermission,
  PERMISSIONS,
  requirePermission,
} from "@/server/permissions";

function user(role: "OWNER" | "ADMIN" | "USER") {
  return { role };
}

describe("hasPermission - OWNER (vollständige Administration)", () => {
  it("has every defined permission", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(user("OWNER"), permission)).toBe(true);
    }
  });
});

describe("hasPermission - ADMIN (operative CRM-Administration)", () => {
  it("has PIPELINE_MANAGE, TAG_MANAGE, LEAD_SCORING_MANAGE", () => {
    expect(hasPermission(user("ADMIN"), "PIPELINE_MANAGE")).toBe(true);
    expect(hasPermission(user("ADMIN"), "TAG_MANAGE")).toBe(true);
    expect(hasPermission(user("ADMIN"), "LEAD_SCORING_MANAGE")).toBe(true);
  });

  it("does NOT have USER_MANAGE, SETTINGS_MANAGE, or AUDIT_VIEW", () => {
    expect(hasPermission(user("ADMIN"), "USER_MANAGE")).toBe(false);
    expect(hasPermission(user("ADMIN"), "SETTINGS_MANAGE")).toBe(false);
    expect(hasPermission(user("ADMIN"), "AUDIT_VIEW")).toBe(false);
  });
});

describe("hasPermission - USER (keine Admin-Permissions)", () => {
  it("has none of the defined permissions", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(user("USER"), permission)).toBe(permission === "EMAIL_SEND");
    }
  });
});

describe("requirePermission", () => {
  it("does not throw when the permission is granted", () => {
    expect(() => requirePermission(user("OWNER"), "USER_MANAGE")).not.toThrow();
  });

  it("throws ForbiddenError when the permission is missing", () => {
    expect(() => requirePermission(user("USER"), "USER_MANAGE")).toThrow(ForbiddenError);
    expect(() => requirePermission(user("ADMIN"), "AUDIT_VIEW")).toThrow(ForbiddenError);
  });
});

describe("canAccessAdministration", () => {
  it("is true for OWNER and ADMIN (each has at least one admin permission)", () => {
    expect(canAccessAdministration(user("OWNER"))).toBe(true);
    expect(canAccessAdministration(user("ADMIN"))).toBe(true);
  });

  it("is false for USER", () => {
    expect(canAccessAdministration(user("USER"))).toBe(false);
  });
});
