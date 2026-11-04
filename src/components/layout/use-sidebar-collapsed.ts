"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "rdevolution-crm:sidebar-collapsed";
const CHANGE_EVENT = "rdevolution-crm:sidebar-collapsed-changed";

// localStorage feuert das native "storage"-Event nur in ANDEREN Tabs, nicht
// im eigenen - für useSyncExternalStore braucht es daher ein eigenes,
// minimales Event als Benachrichtigungskanal. Keine State-Library nötig.
function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Privater Modus, blockierte Site-Daten etc. - Standardzustand (ausgeklappt).
    return false;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

export function useSidebarCollapsed(): [boolean, () => void] {
  const isCollapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !getSnapshot();
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Ignorieren - Zustand gilt dann nur für die aktuelle Seitenansicht.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return [isCollapsed, toggle];
}
