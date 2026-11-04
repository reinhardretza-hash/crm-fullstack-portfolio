import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardKpis } from "../queries";

const EUR_FORMATTER = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

function KpiCard({
  title,
  value,
  emptyHint,
  emphasize,
}: {
  title: string;
  value: string;
  emptyHint?: string;
  // Dezente Hervorhebung für "überfällig" - bewusst kein aggressives Rot
  // (siehe Vorgabe), nur ein gedämpftes Amber, und nur auf dieser einen
  // Kennzahl statt überall im Dashboard.
  emphasize?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold ${emphasize ? "text-amber-700" : "text-black"}`}>
          {value}
        </p>
        {emptyHint && <p className="mt-1 text-xs text-muted">{emptyHint}</p>}
      </CardContent>
    </Card>
  );
}

export async function KpiCards() {
  const kpis = await getDashboardKpis();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <KpiCard
        title="Aktive Leads"
        value={String(kpis.activeLeads)}
        emptyHint={kpis.activeLeads === 0 ? "Noch keine Leads vorhanden." : undefined}
      />
      <KpiCard
        title="Offene Deals"
        value={String(kpis.openDeals)}
        emptyHint={kpis.openDeals === 0 ? "Noch keine offenen Deals vorhanden." : undefined}
      />
      <KpiCard
        title="Deal-Wert (offen)"
        value={EUR_FORMATTER.format(kpis.openDealsValueEuro)}
        emptyHint={kpis.openDealsValueEuro === 0 ? "Noch keine offenen Deals mit Wert." : undefined}
      />
      <KpiCard
        title="Gewonnene Deals"
        value={String(kpis.wonDeals)}
        emptyHint={kpis.wonDeals === 0 ? "Noch keine gewonnenen Deals." : undefined}
      />
      <KpiCard
        title="Verlorene Deals"
        value={String(kpis.lostDeals)}
        emptyHint={kpis.lostDeals === 0 ? "Noch keine verlorenen Deals." : undefined}
      />
      <KpiCard
        title="Offene Aufgaben"
        value={String(kpis.openTasks)}
        emptyHint={kpis.openTasks === 0 ? "Keine offenen Aufgaben." : undefined}
      />
      <KpiCard
        title="Aufgaben heute"
        value={String(kpis.tasksToday)}
        emptyHint={kpis.tasksToday === 0 ? "Keine Aufgaben für heute." : undefined}
      />
      <KpiCard
        title="Überfällige Aufgaben"
        value={String(kpis.overdueTasks)}
        emptyHint={kpis.overdueTasks === 0 ? "Keine überfälligen Aufgaben." : undefined}
        emphasize={kpis.overdueTasks > 0}
      />
      <KpiCard
        title="Pipeline-Wert"
        value={EUR_FORMATTER.format(kpis.pipelineValueEuro)}
        emptyHint={
          kpis.pipelineValueEuro === 0 ? "Noch keine offenen Leads mit erwartetem Wert." : undefined
        }
      />
    </div>
  );
}

export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-12" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
