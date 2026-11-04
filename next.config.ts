import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/quotes/*/pdf": [
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-{400,700}-normal.woff",
    ],
    "/invoices/*/pdf": [
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-{400,700}-normal.woff",
    ],
    "/emails/new": [
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-{400,700}-normal.woff",
    ],
  },
  // Ohne diese Angabe sucht Turbopack nach einer package-lock.json in
  // übergeordneten Verzeichnissen und findet dabei eine unabhängige, nicht
  // zu diesem Projekt gehörende Datei im Benutzerverzeichnis.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
