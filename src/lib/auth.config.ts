import type { NextAuthConfig } from "next-auth";

// Bewusst getrennt von auth.ts: Diese Konfiguration enthält KEINEN Credentials
// Provider und keine Prisma-/Node-Business-Logik - sie wird von proxy.ts
// verwendet und prüft dort nur, ob überhaupt ein gültiges Session-Token
// vorliegt (grobe Authentifizierungs-Gate). Die feingranulare isActive-/
// Rollenprüfung erfolgt weiterhin serverseitig in src/server/rbac.ts.
export const authConfig = {
  // Auth.js core only infers trust from AUTH_URL, not its legacy NEXTAUTH_URL
  // alias. Explicitly configured origin is required behind our localhost proxy.
  trustHost: Boolean(process.env.AUTH_URL || process.env.NEXTAUTH_URL),
  logger: {
    error(error) {
      console.error(
        JSON.stringify({
          event: "AUTH_ERROR",
          type:
            "type" in error &&
            [
              "CredentialsSignin",
              "CallbackRouteError",
              "JWTSessionError",
              "UntrustedHost",
              "MissingSecret",
              "SessionTokenError",
              "AccessDenied",
              "MissingCSRF",
            ].includes(String(error.type))
              ? String(error.type)
              : "Error",
        }),
      );
    },
    warn(code) {
      console.warn(JSON.stringify({ event: "AUTH_WARNING", code }));
    },
    debug() {},
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const isOnDashboard = request.nextUrl.pathname.startsWith("/dashboard");

      if (isOnDashboard) {
        return isLoggedIn;
      }

      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
