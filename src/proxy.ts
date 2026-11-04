import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Next.js 16: "middleware" ist deprecated und wurde durch "proxy" ersetzt
// (https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
// Bewusst weiterhin eine eigene, schlanke NextAuth-Instanz ohne Credentials
// Provider und ohne Prisma/Node-Business-Logik - auch wenn Proxy in Next.js
// 16 standardmäßig im Node.js-Runtime läuft (nicht mehr Edge), bleibt die
// Prüfung hier bewusst auf "liegt ein gültiges Session-Token vor?" begrenzt.
// Die feingranulare isActive-/Rollenprüfung erfolgt weiterhin serverseitig in
// src/server/rbac.ts (getCurrentUser/requireUser/requireRole), da ein JWT
// allein dafür nicht vertrauenswürdig genug ist.
const { auth } = NextAuth(authConfig);

export function proxy(...args: Parameters<typeof auth>) {
  return auth(...args);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
