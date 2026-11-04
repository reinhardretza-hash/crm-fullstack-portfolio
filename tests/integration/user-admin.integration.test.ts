import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/normalize";

let ownerUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => ownerUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const {
  createUserAction,
  updateUserAction,
  setUserActiveAction,
  adminSetPasswordAction,
  changeOwnPasswordAction,
} = await import("@/modules/users/actions");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function createOwner() {
  return prisma.user.create({
    data: {
      id: createId(),
      email: normalizeEmail(`owner-${createId()}@example.com`),
      passwordHash: "irrelevant",
      firstName: "Owner",
      lastName: "User",
      role: "OWNER",
      isActive: true,
    },
  });
}

beforeEach(async () => {
  ownerUser = await createOwner();
});

describe("createUserAction (real PostgreSQL)", () => {
  it("creates a user with a hashed password and writes USER_CREATED", async () => {
    const email = `new-${createId()}@example.com`;
    try {
      await createUserAction(
        { error: null },
        formData({
          firstName: "Max",
          lastName: "Mustermann",
          email,
          role: "USER",
          password: "a-very-secure-password-123",
        }),
      );
    } catch {
      // redirect() wirft einen Next.js-Kontrollfluss-Fehler - erwartet.
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { email: normalizeEmail(email) } });
    expect(user.firstName).toBe("Max");
    expect(user.role).toBe("USER");
    expect(user.passwordHash).not.toBe("a-very-secure-password-123");
    expect(user.passwordHash.length).toBeGreaterThan(20);

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: user.id, action: "USER_CREATED" },
    });
    expect(auditLog).not.toBeNull();
  });

  it("rejects a duplicate email with a friendly error, not a raw DB error", async () => {
    const email = `dup-${createId()}@example.com`;
    await prisma.user.create({
      data: {
        id: createId(),
        email: normalizeEmail(email),
        passwordHash: "x",
        firstName: "Existing",
        lastName: "User",
      },
    });

    const result = await createUserAction(
      { error: null },
      formData({
        firstName: "Max",
        lastName: "Mustermann",
        email,
        role: "USER",
        password: "a-very-secure-password-123",
      }),
    );

    expect(result?.error).toBe("Diese E-Mail-Adresse wird bereits verwendet.");
  });
});

describe("updateUserAction - Rolle ändern (real PostgreSQL)", () => {
  it("changes the role and writes USER_ROLE_CHANGED with from/to metadata", async () => {
    const target = await prisma.user.create({
      data: {
        id: createId(),
        email: normalizeEmail(`target-${createId()}@example.com`),
        passwordHash: "x",
        firstName: "Target",
        lastName: "User",
        role: "USER",
      },
    });

    try {
      await updateUserAction(
        target.id,
        { error: null },
        formData({ firstName: "Target", lastName: "User", email: target.email, role: "ADMIN" }),
      );
    } catch {
      // redirect() wirft einen Next.js-Kontrollfluss-Fehler - erwartet.
    }

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.role).toBe("ADMIN");

    const roleChange = await prisma.auditLog.findFirst({
      where: { entityId: target.id, action: "USER_ROLE_CHANGED" },
    });
    expect(roleChange).not.toBeNull();
    expect(roleChange?.metadata).toEqual({ fromRole: "USER", toRole: "ADMIN" });
  });
});

describe("setUserActiveAction - aktivieren/deaktivieren (real PostgreSQL)", () => {
  it("deactivates a normal user and writes USER_DEACTIVATED", async () => {
    const target = await prisma.user.create({
      data: {
        id: createId(),
        email: normalizeEmail(`deactivate-${createId()}@example.com`),
        passwordHash: "x",
        firstName: "Target",
        lastName: "User",
        role: "USER",
      },
    });

    const result = await setUserActiveAction(target.id, false);
    expect(result.success).toBe(true);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.isActive).toBe(false);

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: target.id, action: "USER_DEACTIVATED" },
    });
    expect(auditLog).not.toBeNull();
  });

  it("reactivates a deactivated user and writes USER_ACTIVATED", async () => {
    const target = await prisma.user.create({
      data: {
        id: createId(),
        email: normalizeEmail(`reactivate-${createId()}@example.com`),
        passwordHash: "x",
        firstName: "Target",
        lastName: "User",
        role: "USER",
        isActive: false,
      },
    });

    const result = await setUserActiveAction(target.id, true);
    expect(result.success).toBe(true);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.isActive).toBe(true);

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: target.id, action: "USER_ACTIVATED" },
    });
    expect(auditLog).not.toBeNull();
  });
});

describe("Letzter aktiver OWNER ist geschützt (real PostgreSQL)", () => {
  it("rejects deactivating the last active OWNER", async () => {
    // ownerUser ist hier der EINZIGE aktive OWNER in der (pro Test
    // geleerten) Testdatenbank.
    const result = await setUserActiveAction(ownerUser.id, false);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/letzte aktive OWNER/);
    }

    const stillOwner = await prisma.user.findUniqueOrThrow({ where: { id: ownerUser.id } });
    expect(stillOwner.isActive).toBe(true);
  });

  it("rejects downgrading the last active OWNER via the edit form", async () => {
    const result = await updateUserAction(
      ownerUser.id,
      { error: null },
      formData({
        firstName: "Owner",
        lastName: "User",
        email: ownerUser.id + "@example.com",
        role: "ADMIN",
      }),
    );

    expect(result?.error).toMatch(/letzte aktive OWNER/);

    const stillOwner = await prisma.user.findUniqueOrThrow({ where: { id: ownerUser.id } });
    expect(stillOwner.role).toBe("OWNER");
  });

  it("allows deactivating an OWNER when a second active OWNER exists", async () => {
    await createOwner();

    const result = await setUserActiveAction(ownerUser.id, false);
    expect(result.success).toBe(true);
  });
});

describe("Passwort ändern invalidiert bestehende Sessions logisch (authVersion, real PostgreSQL)", () => {
  it("adminSetPasswordAction increments authVersion", async () => {
    const target = await prisma.user.create({
      data: {
        id: createId(),
        email: normalizeEmail(`pwtarget-${createId()}@example.com`),
        passwordHash: "x",
        firstName: "Target",
        lastName: "User",
        role: "USER",
      },
    });
    expect(target.authVersion).toBe(1);

    await adminSetPasswordAction(
      target.id,
      { error: null },
      formData({ password: "a-brand-new-secure-password" }),
    );

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(updated.authVersion).toBe(2);
    expect(updated.passwordHash).not.toBe("x");

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: target.id, action: "USER_PASSWORD_RESET" },
    });
    expect(auditLog).not.toBeNull();
  });

  it("changeOwnPasswordAction verifies the current password and increments authVersion", async () => {
    const { hashPassword } = await import("@/modules/auth/hash");
    const currentHash = await hashPassword("current-password-123456");
    ownerUser = await prisma.user.update({
      where: { id: ownerUser.id },
      data: { passwordHash: currentHash },
    });

    const result = await changeOwnPasswordAction(
      { error: null, success: false },
      formData({
        currentPassword: "current-password-123456",
        newPassword: "a-new-secure-password-9999",
        confirmPassword: "a-new-secure-password-9999",
      }),
    );

    expect(result.success).toBe(true);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: ownerUser.id } });
    expect(updated.authVersion).toBe(2);
  });

  it("changeOwnPasswordAction rejects a wrong current password without changing authVersion", async () => {
    const { hashPassword } = await import("@/modules/auth/hash");
    const currentHash = await hashPassword("current-password-123456");
    ownerUser = await prisma.user.update({
      where: { id: ownerUser.id },
      data: { passwordHash: currentHash },
    });

    const result = await changeOwnPasswordAction(
      { error: null, success: false },
      formData({
        currentPassword: "totally-wrong-password",
        newPassword: "a-new-secure-password-9999",
        confirmPassword: "a-new-secure-password-9999",
      }),
    );

    expect(result.success).toBe(false);
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: ownerUser.id } });
    expect(unchanged.authVersion).toBe(1);
  });
});

describe("USER kann Admin-Actions nicht ausführen (real PostgreSQL)", () => {
  it("createUserAction throws ForbiddenError for a plain USER acting user", async () => {
    ownerUser = await prisma.user.create({
      data: {
        id: createId(),
        email: normalizeEmail(`plain-${createId()}@example.com`),
        passwordHash: "x",
        firstName: "Plain",
        lastName: "User",
        role: "USER",
      },
    });

    await expect(
      createUserAction(
        { error: null },
        formData({
          firstName: "Should",
          lastName: "Fail",
          email: `blocked-${createId()}@example.com`,
          role: "USER",
          password: "a-very-secure-password-123",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("OWNER concurrency regression", () => {
  it("keeps an active OWNER when both owners are deactivated concurrently", async () => {
    const second = await createOwner();
    const results = await Promise.all([
      setUserActiveAction(ownerUser.id, false),
      setUserActiveAction(second.id, false),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(await prisma.user.count({ where: { role: "OWNER", isActive: true } })).toBe(1);
  });
  it("keeps an active OWNER when both owners are downgraded concurrently", async () => {
    const second = await createOwner();
    await Promise.allSettled(
      [ownerUser.id, second.id].map((id) =>
        updateUserAction(
          id,
          { error: null },
          formData({
            firstName: "Owner",
            lastName: "User",
            email: id + "@example.com",
            role: "USER",
          }),
        ),
      ),
    );
    expect(await prisma.user.count({ where: { role: "OWNER", isActive: true } })).toBe(1);
  });
});
