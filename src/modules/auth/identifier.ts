import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { normalizeEmail } from "@/lib/normalize";

export { normalizeEmail };

// Ein HMAC-Schlüssel, zwei Domänen: Der Präfix trennt "identifier:" (E-Mail)
// strikt von "origin:" (IP), damit derselbe Schlüssel niemals zum selben Hash
// für unterschiedliche Zwecke führen kann (Domain Separation).
function hmac(domain: "identifier" | "origin", value: string): string {
  return createHmac("sha256", env.LOGIN_RATE_LIMIT_SECRET)
    .update(`${domain}:${value}`)
    .digest("hex");
}

export function hashIdentifier(email: string): string {
  return hmac("identifier", normalizeEmail(email));
}

export function hashOrigin(ip: string): string {
  return hmac("origin", ip);
}
