import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/rbac";
import { requirePagePermission } from "@/server/page-permissions";
import { getStageById } from "@/modules/pipeline/queries";
import { StageForm } from "@/modules/pipeline/components/stage-form";
import { updateStageAction } from "@/modules/pipeline/actions";

export const metadata: Metadata = {
  title: "Pipeline-Stufe bearbeiten – RDEvolution CRM",
};

type EditStagePageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditStagePage({ params }: EditStagePageProps) {
  const user = await requireUser();
  requirePagePermission(user, "PIPELINE_MANAGE");

  const { id } = await params;
  const stage = await getStageById(id);
  if (!stage) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">
        Pipeline-Stufe bearbeiten: {stage.name} ({stage.pipeline.name})
      </h2>
      <StageForm
        action={updateStageAction.bind(null, stage.id)}
        defaultValues={{
          name: stage.name,
          probability: stage.probability,
          color: stage.color,
          isWonStage: stage.isWonStage,
          isLostStage: stage.isLostStage,
          version: stage.version,
        }}
      />
    </div>
  );
}
