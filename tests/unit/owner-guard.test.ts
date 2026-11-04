import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { assertOwnerProtection } from "@/modules/users/owner-guard";

const countMock = vi.fn();
const findMock = vi.fn();
const txMock = {
  $executeRaw: vi.fn(),
  user: { count: (...args: unknown[]) => countMock(...args), findUnique: findMock },
} as never;

beforeEach(() => {
  countMock.mockReset();
  findMock.mockReset();
  findMock.mockResolvedValue({ id: "owner-1", role: "OWNER", isActive: true });
});

describe("assertOwnerProtection - letzter aktiver OWNER", () => {
  it("throws when deactivating the last active OWNER", async () => {
    countMock.mockResolvedValueOnce(0);

    await expect(
      assertOwnerProtection(
        txMock,
        { id: "owner-1", role: "OWNER", isActive: true },
        { role: "OWNER", isActive: false },
      ),
    ).rejects.toThrow(AppError);
  });

  it("throws when downgrading the last active OWNER to ADMIN", async () => {
    countMock.mockResolvedValueOnce(0);

    await expect(
      assertOwnerProtection(
        txMock,
        { id: "owner-1", role: "OWNER", isActive: true },
        { role: "ADMIN", isActive: true },
      ),
    ).rejects.toThrow(AppError);
  });

  it("throws when downgrading the last active OWNER to USER", async () => {
    countMock.mockResolvedValueOnce(0);

    await expect(
      assertOwnerProtection(
        txMock,
        { id: "owner-1", role: "OWNER", isActive: true },
        { role: "USER", isActive: true },
      ),
    ).rejects.toThrow(AppError);
  });

  it("allows deactivating an OWNER when another active OWNER still exists", async () => {
    countMock.mockResolvedValueOnce(1);

    await expect(
      assertOwnerProtection(
        txMock,
        { id: "owner-1", role: "OWNER", isActive: true },
        { role: "OWNER", isActive: false },
      ),
    ).resolves.not.toThrow();
  });

  it("does not even query the database for a non-critical change (not currently an active OWNER)", async () => {
    findMock.mockResolvedValueOnce({ id: "user-1", role: "USER", isActive: true });
    await assertOwnerProtection(
      txMock,
      { id: "user-1", role: "USER", isActive: true },
      { role: "USER", isActive: false },
    );
    expect(countMock).not.toHaveBeenCalled();
  });

  it("allows an OWNER to change their own unrelated fields while staying an active OWNER", async () => {
    await assertOwnerProtection(
      txMock,
      { id: "owner-1", role: "OWNER", isActive: true },
      { role: "OWNER", isActive: true },
    );
    expect(countMock).not.toHaveBeenCalled();
  });

  it("excludes the target user themselves from the 'other active OWNERs' count", async () => {
    countMock.mockResolvedValueOnce(0);

    await expect(
      assertOwnerProtection(
        txMock,
        { id: "owner-1", role: "OWNER", isActive: true },
        { role: "USER", isActive: true },
      ),
    ).rejects.toThrow();

    expect(countMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: "owner-1" } }),
      }),
    );
  });
});
