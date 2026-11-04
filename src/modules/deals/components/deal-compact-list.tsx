import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { DealStatus } from "@/generated/prisma/client";
import { DEAL_STATUS_LABELS } from "@/lib/crm-labels";
import { formatCentsAsEuro } from "@/lib/money";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { dateStyle: "short" });

type CompactDeal = {
  id: string;
  name: string;
  status: DealStatus;
  valueCents: number;
  expectedCloseDate: Date | null;
};

type DealCompactListProps = {
  deals: CompactDeal[];
  // Wird auf Company/Contact-Detailseiten gezeigt (erwarteter Abschluss),
  // aber nicht auf der Lead-Detailseite (dort reicht Name/Status/Wert, siehe
  // Vorgabe Punkt 24 vs. 25/26) - daher optional statt immer gerendert.
  showExpectedCloseDate?: boolean;
};

// Bewusst schlank (keine Pagination, kein Filtern) - für die kompakten
// Deal-Sektionen auf Lead-/Company-/Contact-Detailseiten (siehe Vorgabe:
// "Keine riesige Unteransicht").
export function DealCompactList({ deals, showExpectedCloseDate }: DealCompactListProps) {
  if (deals.length === 0) {
    return <p className="text-sm text-muted">Keine Deals vorhanden.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {deals.map((deal) => (
        <li key={deal.id} className="flex items-center justify-between gap-2 text-sm">
          <Link href={`/deals/${deal.id}`} className="text-black hover:underline">
            {deal.name}
          </Link>
          <div className="flex items-center gap-2 text-secondary">
            <Badge variant={deal.status === "WON" ? "gold" : "neutral"}>
              {DEAL_STATUS_LABELS[deal.status]}
            </Badge>
            <span>{formatCentsAsEuro(deal.valueCents)}</span>
            {showExpectedCloseDate && deal.expectedCloseDate && (
              <span>{DATE_FORMATTER.format(deal.expectedCloseDate)}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
