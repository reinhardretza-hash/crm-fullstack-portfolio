import type { DefaultSession } from "next-auth";

// Überschreibt die next-auth-Standardtypen bewusst minimal: Die Session
// transportiert ausschließlich die userId. Rolle/isActive werden NIE aus dem
// Token übernommen, sondern bei jeder sicherheitskritischen Aktion frisch aus
// PostgreSQL geladen (siehe src/server/rbac.ts).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      // Siehe src/server/rbac.ts: wird gegen den aktuellen DB-Wert
      // verglichen, um Sessions nach einer Passwortänderung logisch zu
      // invalidieren, ohne einen serverseitigen Session-Store zu benötigen.
      authVersion: number;
    } & DefaultSession["user"];
  }
}

// "next-auth/jwt" re-exportiert die JWT-Schnittstelle nur via `export *` aus
// "@auth/core/jwt" - Declaration Merging muss daher auf dem Ursprungsmodul
// erfolgen, sonst greift die Erweiterung nicht.
declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
    authVersion?: number;
  }
}
