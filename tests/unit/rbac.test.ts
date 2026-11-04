import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/lib/errors";

const authMock = vi.fn();
const findUniqueMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

const { getCurrentUser, requireUser, requireRole } = await import("@/server/rbac");

function makeUser(
  overrides: Partial<{
    id: string;
    role: "OWNER" | "ADMIN" | "USER";
    isActive: boolean;
    authVersion: number;
  }> = {},
) {
  return {
    id: "user-1",
    email: "user@example.com",
    passwordHash: "hash",
    firstName: "Max",
    lastName: "Mustermann",
    role: "USER" as const,
    isActive: true,
    authVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  authMock.mockReset();
  findUniqueMock.mockReset();
  redirectMock.mockClear();
});

describe("getCurrentUser", () => {
  it("returns null when there is no session", async () => {
    authMock.mockResolvedValueOnce(null);
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns null when the session user no longer exists in the database", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "user-1", authVersion: 1 } });
    findUniqueMock.mockResolvedValueOnce(null);
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns null when the user has been deactivated (even with a valid JWT)", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "user-1", authVersion: 1 } });
    findUniqueMock.mockResolvedValueOnce(makeUser({ isActive: false }));
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns null when authVersion in the JWT no longer matches the DB (password changed since login)", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "user-1", authVersion: 1 } });
    findUniqueMock.mockResolvedValueOnce(makeUser({ authVersion: 2 }));
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns the freshly loaded user when active and authVersion matches", async () => {
    const user = makeUser();
    authMock.mockResolvedValueOnce({ user: { id: "user-1", authVersion: 1 } });
    findUniqueMock.mockResolvedValueOnce(user);
    await expect(getCurrentUser()).resolves.toEqual(user);
  });
});

describe("requireUser", () => {
  it("redirects unauthenticated users to /login", async () => {
    authMock.mockResolvedValueOnce(null);
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("returns the user when authenticated and active", async () => {
    const user = makeUser();
    authMock.mockResolvedValueOnce({ user: { id: "user-1", authVersion: 1 } });
    findUniqueMock.mockResolvedValueOnce(user);
    await expect(requireUser()).resolves.toEqual(user);
  });
});

describe("requireRole", () => {
  it("allows OWNER to perform an OWNER-protected operation", () => {
    const owner = makeUser({ role: "OWNER" });
    expect(() => requireRole(owner, ["OWNER"])).not.toThrow();
  });

  it("blocks USER from an OWNER-protected operation", () => {
    const user = makeUser({ role: "USER" });
    expect(() => requireRole(user, ["OWNER"])).toThrow(ForbiddenError);
  });
});
