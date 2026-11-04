import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { resolveTagIds } from "@/modules/tags/service";

const upsertMock = vi.fn();
const executeRawUnsafeMock = vi.fn().mockResolvedValue(undefined);
const findUniqueOrThrowMock = vi.fn();
const tx = {
  tag: { upsert: upsertMock, findUniqueOrThrow: findUniqueOrThrowMock },
  $executeRawUnsafe: executeRawUnsafeMock,
} as unknown as Parameters<typeof resolveTagIds>[0];

beforeEach(() => {
  upsertMock.mockReset();
  executeRawUnsafeMock.mockClear();
  findUniqueOrThrowMock.mockReset();
  upsertMock.mockImplementation(({ where }: { where: { normalizedName: string } }) =>
    Promise.resolve({
      id: `tag-${where.normalizedName}`,
      name: where.normalizedName,
      normalizedName: where.normalizedName,
    }),
  );
});

describe("resolveTagIds", () => {
  it("upserts one tag per unique normalized name", async () => {
    await resolveTagIds(tx, ["Handwerk"]);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { normalizedName: "handwerk" },
        create: { name: "Handwerk", normalizedName: "handwerk" },
      }),
    );
  });

  it("treats 'Handwerk', 'handwerk' and 'HANDWERK' as a single tag - no duplicates", async () => {
    const ids = await resolveTagIds(tx, ["Handwerk", "handwerk", "HANDWERK"]);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(ids).toHaveLength(1);
  });

  it("resolves multiple distinct tags to multiple ids", async () => {
    const ids = await resolveTagIds(tx, ["Handwerk", "Softwarebedarf"]);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(ids).toHaveLength(2);
  });

  it("ignores empty/whitespace-only tag entries", async () => {
    const ids = await resolveTagIds(tx, ["  ", ""]);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(ids).toHaveLength(0);
  });

  it("wraps the upsert in a SAVEPOINT so a failed attempt doesn't poison the caller's transaction", async () => {
    await resolveTagIds(tx, ["Handwerk"]);
    expect(executeRawUnsafeMock).toHaveBeenCalledWith(expect.stringContaining("SAVEPOINT"));
    expect(executeRawUnsafeMock).toHaveBeenCalledWith(expect.stringContaining("RELEASE"));
  });

  it(
    "regression: recovers from a concurrent-insert unique constraint violation by rolling back " +
      "to the savepoint and re-reading the row the winning transaction just created, instead of " +
      "propagating the raw database error (found via a real PostgreSQL concurrency integration test)",
    async () => {
      const conflictError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      });
      upsertMock.mockRejectedValueOnce(conflictError);
      findUniqueOrThrowMock.mockResolvedValueOnce({
        id: "tag-handwerk",
        name: "Handwerk",
        normalizedName: "handwerk",
      });

      const ids = await resolveTagIds(tx, ["Handwerk"]);

      expect(ids).toEqual(["tag-handwerk"]);
      expect(executeRawUnsafeMock).toHaveBeenCalledWith(
        expect.stringContaining("ROLLBACK TO SAVEPOINT"),
      );
      expect(findUniqueOrThrowMock).toHaveBeenCalledWith({ where: { normalizedName: "handwerk" } });
    },
  );

  it("re-throws an unrelated database error instead of swallowing it as a conflict", async () => {
    upsertMock.mockRejectedValueOnce(new Error("connection lost"));

    await expect(resolveTagIds(tx, ["Handwerk"])).rejects.toThrow("connection lost");
    expect(findUniqueOrThrowMock).not.toHaveBeenCalled();
  });
});
