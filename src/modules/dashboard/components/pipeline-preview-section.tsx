import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PipelineIcon } from "@/components/ui/icons";
import { getDefaultPipeline, getPipelineBoard } from "@/modules/leads/queries";

// Phase 3: Pipeline/Leads existieren jetzt echt - zeigt eine kompakte,
// echte Stufen-Übersicht der Standardpipeline statt des früheren Platzhalters.
export async function PipelinePreviewSection() {
  const defaultPipeline = await getDefaultPipeline();

  if (!defaultPipeline) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<PipelineIcon className="h-8 w-8" />}
            title="Noch keine Pipeline vorhanden."
          />
        </CardContent>
      </Card>
    );
  }

  const { pipeline, leads } = await getPipelineBoard(defaultPipeline.id);
  const openLeads = leads.filter((lead) => lead.status === "OPEN");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
      </CardHeader>
      <CardContent>
        {openLeads.length === 0 ? (
          <EmptyState
            icon={<PipelineIcon className="h-8 w-8" />}
            title="Die Vertriebspipeline wird verfügbar, sobald Leads angelegt wurden."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {pipeline?.stages.map((stage) => {
              const count = openLeads.filter((lead) => lead.stage.id === stage.id).length;
              return (
                <div key={stage.id} className="flex items-center justify-between text-sm">
                  <span className="text-black/70">{stage.name}</span>
                  <span className="font-medium text-black">{count}</span>
                </div>
              );
            })}
            <Link href="/pipeline" className="mt-2 text-sm text-gold-foreground hover:underline">
              Zum Pipeline Board →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
