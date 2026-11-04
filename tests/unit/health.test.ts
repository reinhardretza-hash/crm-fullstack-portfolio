import { beforeEach, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: query } }));
import { GET } from "@/app/api/health/route";
beforeEach(() => {
  query.mockReset();
});
it("reports readiness without application data and never caches", async () => {
  query.mockResolvedValue([{ value: 1 }]);
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});
it("returns a minimal 503 without exposing the driver error", async () => {
  query.mockRejectedValue(new Error("PRIVATE_DATABASE_CREDENTIAL"));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable" });
});
