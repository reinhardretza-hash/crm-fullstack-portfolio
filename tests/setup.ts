import { afterEach } from "vitest";

// Test-Environment-Variablen. Rein synthetische Werte, keine echten Secrets.
// NODE_ENV wird von Vitest bereits automatisch auf "test" gesetzt.
process.env.DATABASE_URL ??=
  "postgresql://test:test@localhost:5432/rdevolution_crm_test?schema=public";
process.env.AUTH_SECRET ??= "test-auth-secret-at-least-32-characters-long";
process.env.LOGIN_RATE_LIMIT_SECRET ??= "test-rate-limit-secret-at-least-32-chars";

// jsdom (für UI-Komponententests) implementiert einige Browser-APIs nicht,
// die Radix UI (Tooltip/Dialog/DropdownMenu) intern nutzt. Nur in der
// jsdom-Umgebung nötig, daher per typeof-Guard abgesichert.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  if (!("ResizeObserver" in window)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    // @ts-expect-error - Test-Stub, keine vollständige ResizeObserver-Implementierung.
    window.ResizeObserver = ResizeObserverStub;
  }

  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }

  // Ohne diesen Cleanup würden mehrere `render()`-Aufrufe innerhalb derselben
  // Testdatei ihre DOM-Bäume anhäufen und nachfolgende Queries mit
  // "mehrere Elemente gefunden" fehlschlagen lassen.
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
}
