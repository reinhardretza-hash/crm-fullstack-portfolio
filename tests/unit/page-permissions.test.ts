import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));
import { requirePagePermission } from "@/server/page-permissions";
import { PERMISSIONS } from "@/server/permissions";

describe("admin page permission denial", () => {
  it.each(PERMISSIONS.filter((p) => p !== "EMAIL_SEND"))(
    "blocks USER from %s through the 404 boundary",
    (permission) => {
      expect(() => requirePagePermission({ role: "USER" }, permission)).toThrow(
        "NEXT_HTTP_ERROR_FALLBACK;404",
      );
    },
  );
  it.each(["USER_MANAGE", "SETTINGS_MANAGE", "AUDIT_VIEW"] as const)(
    "blocks ADMIN from %s without an application error",
    (permission) => {
      expect(() => requirePagePermission({ role: "ADMIN" }, permission)).toThrow(
        "NEXT_HTTP_ERROR_FALLBACK;404",
      );
    },
  );
  it("allows OWNER pages and operative ADMIN pages", () => {
    for (const permission of PERMISSIONS)
      expect(() => requirePagePermission({ role: "OWNER" }, permission)).not.toThrow();
    for (const permission of ["PIPELINE_MANAGE", "TAG_MANAGE", "LEAD_SCORING_MANAGE"] as const)
      expect(() => requirePagePermission({ role: "ADMIN" }, permission)).not.toThrow();
  });
});
