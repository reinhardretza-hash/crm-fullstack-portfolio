import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/lib/auth.config";
import { GENERIC_LOGIN_ERROR } from "@/modules/auth/config";
import { verifyLogin } from "@/modules/auth/verify-login";
import { loginSchema } from "@/validations/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(rawCredentials, request) {
        const parsed = loginSchema.safeParse(rawCredentials);

        // Auch bei technisch ungültigem Input (leeres Feld etc.) dieselbe
        // generische Fehlermeldung - kein struktureller Unterschied nach außen.
        if (!parsed.success) {
          throw new Error(GENERIC_LOGIN_ERROR);
        }

        const result = await verifyLogin(parsed.data.email, parsed.data.password, request);

        if (!result.success) {
          throw new Error(GENERIC_LOGIN_ERROR);
        }

        // Minimaler Rückgabewert: nur id/authVersion fließen in JWT-Claims
        // ein (siehe src/server/rbac.ts für die Begründung von authVersion).
        return { id: result.userId, authVersion: result.authVersion };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.authVersion = (user as { authVersion: number }).authVersion;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
        session.user.authVersion = token.authVersion ?? 0;
      }
      return session;
    },
  },
});
