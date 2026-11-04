import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/server/rbac";
import { requirePagePermission } from "@/server/page-permissions";
import { listPipelinesForAdmin } from "@/modules/pipeline/queries";
import { StageMoveButtons } from "@/modules/pipeline/components/stage-move-buttons";
import { StageDeleteButton } from "@/modules/pipeline/components/stage-delete-button";
import { PipelineActiveToggle } from "@/modules/pipeline/components/pipeline-active-toggle";

export const metadata: Metadata = {
  title: "Pipeline-Einstellungen – RDEvolution CRM",
};

export default async function PipelineSettingsPage() {
  const user = await requireUser();
  requirePagePermission(user, "PIPELINE_MANAGE");

  const pipelines = await listPipelinesForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Pipeline-Einstellungen</h2>

      {pipelines.map((pipeline) => (
        <Card key={pipeline.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              {pipeline.name}
              {pipeline.isDefault && (
                <Badge variant="gold" className="ml-2">
                  Standard
                </Badge>
              )}
              <Badge
                variant="neutral"
                className={pipeline.isActive ? "ml-2" : "ml-2 bg-red-100 text-red-700"}
              >
                {pipeline.isActive ? "Aktiv" : "Inaktiv"}
              </Badge>
            </CardTitle>
            <PipelineActiveToggle pipelineId={pipeline.id} isActive={pipeline.isActive} />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stufe</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Standardwahrscheinlichkeit</TableHead>
                  <TableHead>Markierung</TableHead>
                  <TableHead>
                    <span className="sr-only">Reihenfolge</span>
                  </TableHead>
                  <TableHead>
                    <span className="sr-only">Aktionen</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pipeline.stages.map((stage, index) => (
                  <TableRow key={stage.id}>
                    <TableCell className="font-medium text-black">
                      <Link
                        href={`/settings/pipeline/stages/${stage.id}/edit`}
                        className="hover:underline"
                      >
                        {stage.name}
                      </Link>
                    </TableCell>
                    <TableCell>{stage.position}</TableCell>
                    <TableCell>
                      {stage.probability !== null ? `${stage.probability}%` : "–"}
                    </TableCell>
                    <TableCell>
                      {stage.isWonStage && <Badge variant="gold">Gewonnen</Badge>}
                      {stage.isLostStage && (
                        <Badge variant="neutral" className="bg-red-100 text-red-700">
                          Verloren
                        </Badge>
                      )}
                      {!stage.isWonStage && !stage.isLostStage && "–"}
                    </TableCell>
                    <TableCell>
                      <StageMoveButtons
                        stageId={stage.id}
                        isFirst={index === 0}
                        isLast={index === pipeline.stages.length - 1}
                      />
                    </TableCell>
                    <TableCell>
                      <StageDeleteButton stageId={stage.id} stageName={stage.name} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
