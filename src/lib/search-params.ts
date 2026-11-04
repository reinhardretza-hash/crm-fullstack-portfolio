// Baut eine neue URL mit aktualisierten Search Params, damit Ansichten
// verlinkbar bleiben und Browser Back/Forward korrekt funktioniert (Filter
// leben ausschließlich in der URL, nicht in verstecktem Client-State).
export function buildFilterUrl(
  pathname: string,
  current: URLSearchParams,
  updates: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams(current.toString());

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  // Ein geänderter Filter (aber nicht die Seite selbst) springt zurück auf
  // Seite 1 - sonst könnte man auf einer nicht mehr existierenden Seite landen.
  if (!("page" in updates)) {
    params.delete("page");
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

// Next.js liefert Page-`searchParams` als Record<string, string | string[] |
// undefined> - für Sortier-Links in Tabellen brauchen wir daraus ein echtes
// URLSearchParams-Objekt.
export function toURLSearchParams(
  rawParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(rawParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else {
      params.set(key, value);
    }
  }

  return params;
}
