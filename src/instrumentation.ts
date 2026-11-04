export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // This Next version leaves a rejected instrumentation hook alive. Exit
    // explicitly so a process supervisor can detect invalid startup configuration.
    try {
      await import("@/lib/env");
    } catch {
      console.error("CRM-Start abgebrochen: Environment-Konfiguration prüfen.");
      process.exit(1);
    }
  }
}
