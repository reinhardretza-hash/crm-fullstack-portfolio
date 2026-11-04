import { z } from "zod";

// Validiert Environment-Variablen einmalig beim Modul-Import. Ein fehlender
// oder ungültiger Wert lässt den Prozess sofort mit einer klaren Meldung
// abbrechen, statt später mit einem kryptischen Laufzeitfehler.
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (value) => /^postgres(ql)?:\/\//.test(value),
        "DATABASE_URL muss PostgreSQL verwenden.",
      ),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET muss mindestens 32 Zeichen lang sein."),
    NEXTAUTH_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
    AUTH_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),

    // Separates Secret (nicht AUTH_SECRET) für den HMAC des Login-Rate-Limit-
    // Identifiers – eigener Rotationszyklus, keine Kopplung an Session-Signierung.
    LOGIN_RATE_LIMIT_SECRET: z
      .string()
      .min(32, "LOGIN_RATE_LIMIT_SECRET muss mindestens 32 Zeichen lang sein."),
  })
  .refine((value) => value.AUTH_SECRET !== value.LOGIN_RATE_LIMIT_SECRET, {
    path: ["LOGIN_RATE_LIMIT_SECRET"],
    message: "Muss unabhängig von AUTH_SECRET sein.",
  })
  .refine(
    (value) => value.NODE_ENV !== "production" || Boolean(value.AUTH_URL || value.NEXTAUTH_URL),
    {
      path: ["AUTH_URL"],
      message: "AUTH_URL oder NEXTAUTH_URL muss in Produktion gesetzt sein.",
    },
  )
  .refine(
    (value) => !value.AUTH_URL || !value.NEXTAUTH_URL || value.AUTH_URL === value.NEXTAUTH_URL,
    {
      path: ["AUTH_URL"],
      message: "AUTH_URL und NEXTAUTH_URL müssen übereinstimmen.",
    },
  );

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Ungültige oder fehlende Environment-Variablen:\n${issues}`);
  }

  // Auth.js uses ?? for its legacy alias; an empty AUTH_URL would otherwise
  // shadow a valid NEXTAUTH_URL and fail only during a request.
  if (process.env.AUTH_URL === "") delete process.env.AUTH_URL;
  if (process.env.NEXTAUTH_URL === "") delete process.env.NEXTAUTH_URL;

  return parsed.data;
}

export const env = loadEnv();
