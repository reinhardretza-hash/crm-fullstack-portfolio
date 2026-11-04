import { afterEach, expect, it, vi } from "vitest";
import { authConfig } from "@/lib/auth.config";
afterEach(() => vi.restoreAllMocks());
it("logs auth failure type without raw cause, tokens or connection data", () => {
  const error = Object.assign(
    new Error("PRIVATE_MARKER", { cause: { err: new Error("PRIVATE_TOKEN_MARKER") } }),
    { type: "CallbackRouteError" },
  );
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  authConfig.logger.error(error);
  expect(log).toHaveBeenCalledOnce();
  const entry = String(log.mock.calls[0][0]);
  expect(entry).not.toContain("PRIVATE");
  expect(JSON.parse(entry)).toEqual({ event: "AUTH_ERROR", type: error.type });
});
