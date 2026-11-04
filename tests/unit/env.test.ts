import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it.each(["DATABASE_URL", "AUTH_SECRET", "LOGIN_RATE_LIMIT_SECRET"])(
  "rejects missing %s without logging values",
  async (key) => {
    vi.resetModules();
    vi.stubEnv(key, "");
    await expect(import("@/lib/env")).rejects.toThrow(key);
  },
);
it("does not validate removed bootstrap credentials at runtime", async () => {
  vi.resetModules();
  vi.stubEnv("INITIAL_OWNER_EMAIL", "");
  vi.stubEnv("INITIAL_OWNER_PASSWORD", "");
  expect((await import("@/lib/env")).env.DATABASE_URL).toBeTruthy();
});
it("requires separate signing and rate-limit secrets", async () => {
  vi.resetModules();
  vi.stubEnv("LOGIN_RATE_LIMIT_SECRET", process.env.AUTH_SECRET);
  await expect(import("@/lib/env")).rejects.toThrow("unabhängig");
});
it("requires an explicit production origin", async () => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AUTH_URL", "");
  vi.stubEnv("NEXTAUTH_URL", "");
  await expect(import("@/lib/env")).rejects.toThrow("in Produktion");
});
it("rejects conflicting origin aliases", async () => {
  vi.resetModules();
  vi.stubEnv("AUTH_URL", "http://localhost:3001");
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
  await expect(import("@/lib/env")).rejects.toThrow("übereinstimmen");
});
