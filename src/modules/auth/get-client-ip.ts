// Vertrauensmodell (siehe docs/deployment-security.md): In Produktion sitzt
// genau EIN vertrauenswürdiger Reverse Proxy (Nginx, auf demselben Host)
// vor Next.js; der interne Next.js-Port ist nicht öffentlich erreichbar.
//
// Jeder Hop, der X-Forwarded-For weiterleitet, HÄNGT seinen eigenen
// beobachteten Client an das rechte Ende der Liste an (Standardverhalten von
// Nginx über `$proxy_add_x_forwarded_for`). Der am weitesten RECHTS stehende
// Wert ist deshalb immer der, den UNSER eigener Nginx unmittelbar auf
// TCP-Ebene beobachtet hat - der kann von einem Client nicht gefälscht
// werden. Der am weitesten LINKS stehende Wert dagegen ist genau der Teil,
// den ein Client selbst im Request-Header mitschicken kann - ihn zu
// verwenden (wie eine frühere Version dieser Funktion es tat) wäre ein
// Bypass des Origin-Rate-Limitings. Es wird daher bewusst NUR der rechte
// Wert verwendet, niemals der linke.
//
// Ohne vorgeschalteten Reverse Proxy (z. B. lokale Entwicklung ohne Nginx)
// ist kein verlässlicher Wert verfügbar - dann wird ein fester Platzhalter
// verwendet, der alle direkten Verbindungen in einen gemeinsamen
// Origin-Bucket fasst.
const UNKNOWN_ORIGIN = "unknown-origin";

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const hops = forwardedFor
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const trustedHop = hops?.at(-1);
  return trustedHop || UNKNOWN_ORIGIN;
}
