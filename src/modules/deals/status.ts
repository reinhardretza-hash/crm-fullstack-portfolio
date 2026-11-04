import type { DealLostReason, DealStatus } from "@/generated/prisma/client";
export const canDeleteDeal = (status: DealStatus) => status === "OPEN";

export type DealStatusPatch = {
  status: DealStatus;
  closedAt: Date | null;
  lostReason: DealLostReason | null;
  lostReasonNote: string | null;
};

// EINZIGE Stelle, die aus einer Statusänderung (Won/Lost/Reopen) den
// resultierenden Datensatz-Patch ableitet - wird von
// src/modules/deals/actions.ts aufgerufen, nicht dupliziert. Pure Funktionen
// (kein DB-Zugriff) - direkt unit-testbar.
export function dealWonPatch(now: Date = new Date()): DealStatusPatch {
  // lostReason/lostReasonNote werden zurückgesetzt (siehe Begründung in
  // schema.prisma beim Deal-Model) - ein gewonnener Deal hat keinen
  // Verlustgrund mehr.
  return { status: "WON", closedAt: now, lostReason: null, lostReasonNote: null };
}

export function dealLostPatch(
  input: { lostReason?: DealLostReason; lostReasonNote?: string },
  now: Date = new Date(),
): DealStatusPatch {
  return {
    status: "LOST",
    closedAt: now,
    lostReason: input.lostReason ?? null,
    lostReasonNote: input.lostReasonNote ?? null,
  };
}

// Reopen setzt lostReason/lostReasonNote bewusst zurück statt sie zu
// erhalten (siehe Begründung in schema.prisma): ein wiedereröffneter Deal
// hat (noch) keinen Verlustgrund mehr - der alte Grund bliebe sonst
// irreführend stehen. Die Historie bleibt über die Activity/AuditLog-
// Metadata des ursprünglichen DEAL_LOST-Eintrags nachvollziehbar.
export function dealReopenPatch(): DealStatusPatch {
  return { status: "OPEN", closedAt: null, lostReason: null, lostReasonNote: null };
}
