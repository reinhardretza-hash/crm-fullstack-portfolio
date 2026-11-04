import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PipelineIcon } from "@/components/ui/icons";
import { formatCentsAsEuro } from "@/lib/money";
import { getDefaultPipeline, getPipelineBoard } from "@/modules/leads/queries";
import { PipelineBoard } from "@/modules/pipeline/components/pipeline-board";
import { Suspense } from "react";
import { parsePaginationParams } from "@/lib/pagination";
import { PaginationControls } from "@/components/filters/pagination-controls";

export const metadata: Metadata = {
  title: "Pipeline – RDEvolution CRM",
};

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const pagination = parsePaginationParams(await searchParams);
  const defaultPipeline = await getDefaultPipeline();

  if (!defaultPipeline) {
    return (
      <EmptyState
        icon={<PipelineIcon className="h-8 w-8" />}
        title="Keine Pipeline vorhanden."
        description="Die Standardpipeline wird beim nächsten Seed-Lauf automatisch angelegt."
      />
    );
  }

  const { pipeline, leads, totalCount, totalPages, openCount, openValueCents } =
    await getPipelineBoard(defaultPipeline.id, pagination);
  if (!pipeline) {
    notFound();
  }

  // Nur echte Daten (siehe Vorgabe) - keine Forecast-Berechnung.

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Pipeline – {pipeline.name}</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Offene Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-black">{openCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Erwarteter Gesamtwert</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-black">{formatCentsAsEuro(openValueCents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Stufen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-black">{pipeline.stages.length}</p>
          </CardContent>
        </Card>
      </div>

      <PipelineBoard
        key={`${pagination.page}-${pagination.pageSize}`}
        stages={pipeline.stages}
        initialLeads={leads}
      />
      <Suspense>
        <PaginationControls {...pagination} totalCount={totalCount} totalPages={totalPages} />
      </Suspense>
    </div>
  );
}
