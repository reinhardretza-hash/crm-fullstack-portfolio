import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

// Simuliert den echten End-to-End-Ablauf aus Vorgabe Punkt 34, aber auf
// Anwendungsebene statt über einen echten Browser/HTTP-Request: `auth()`
// wird gemockt, um genau die JWT-Session-Claims nachzubilden, die
// Auth.js nach einem echten Login erzeugen würde (siehe src/lib/auth.ts:
// jwt()/session()-Callbacks kopieren userId + authVersion 1:1 aus dem
// `authorize()`-Rückgabewert). Alles andere (verifyLogin, getCurrentUser,
// Passwort-Änderung) läuft unverändert gegen echtes PostgreSQL.
let currentSession: { user: { id: string; authVersion: number } } | null = null;

vi.mock("@/lib/auth", () => ({
  auth: async () => currentSession,
}));

const { verifyLogin } = await import("@/modules/auth/verify-login");
const { getCurrentUser } = await import("@/server/rbac");
const { changeOwnPasswordAction } = await import("@/modules/users/actions");
const { hashPassword } = await import("@/modules/auth/hash");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function fakeRequest(): Request {
  return new Request("http://localhost/api/auth/callback/credentials", {
    headers: { "x-forwarded-for": "127.0.0.1" },
  });
}

let user: { id: string; email: string };

beforeEach(async () => {
  const passwordHash = await hashPassword("original-password-123456");
  user = await prisma.user.create({
    data: {
      id: createId(),
      email: `${createId()}@example.com`,
      passwordHash,
      firstName: "Test",
      lastName: "User",
      role: "OWNER",
    },
  });
  currentSession = null;
});

describe("Vollständiger authVersion-Ablauf: Login -> Passwortänderung -> alte Session ungültig -> Re-Login (real PostgreSQL)", () => {
  it("runs the exact sequence from the spec", async () => {
    // 1+2: Benutzer loggt sich ein, erhält (simuliert) ein JWT mit der
    // aktuellen authVersion.
    const loginResult = await verifyLogin(user.email, "original-password-123456", fakeRequest());
    expect(loginResult.success).toBe(true);
    if (!loginResult.success) throw new Error("unreachable");
    expect(loginResult.authVersion).toBe(1);

    currentSession = { user: { id: user.id, authVersion: loginResult.authVersion } };

    // Mit diesem (simulierten) JWT ist der Benutzer normal authentifiziert.
    const beforeChange = await getCurrentUser();
    expect(beforeChange?.id).toBe(user.id);

    // 3+4: Passwort wird geändert, authVersion in der DB erhöht sich.
    const changeResult = await changeOwnPasswordAction(
      { error: null, success: false },
      formData({
        currentPassword: "original-password-123456",
        newPassword: "a-brand-new-password-999",
        confirmPassword: "a-brand-new-password-999",
      }),
    );
    expect(changeResult.success).toBe(true);

    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.authVersion).toBe(2);

    // 5+6: Das ALTE (simulierte) JWT trägt immer noch authVersion=1 -
    // genau dieses "alte Token" wird erneut verwendet. Der Zugriff muss
    // verweigert werden, obwohl das Token selbst technisch noch nicht
    // abgelaufen ist.
    const afterChangeWithOldToken = await getCurrentUser();
    expect(afterChangeWithOldToken).toBeNull();

    // 7: Ein neuer Login mit dem NEUEN Passwort liefert eine frische
    // authVersion, mit der der Zugriff wieder funktioniert.
    const reloginResult = await verifyLogin(user.email, "a-brand-new-password-999", fakeRequest());
    expect(reloginResult.success).toBe(true);
    if (!reloginResult.success) throw new Error("unreachable");
    expect(reloginResult.authVersion).toBe(2);

    currentSession = { user: { id: user.id, authVersion: reloginResult.authVersion } };
    const afterRelogin = await getCurrentUser();
    expect(afterRelogin?.id).toBe(user.id);

    // Der alte Login mit dem alten Passwort funktioniert nicht mehr.
    const oldPasswordLogin = await verifyLogin(user.email, "original-password-123456", fakeRequest());
    expect(oldPasswordLogin.success).toBe(false);
  });
});
