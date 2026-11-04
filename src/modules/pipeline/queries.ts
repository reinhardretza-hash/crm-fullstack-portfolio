import { prisma } from "@/lib/prisma";

// Für /settings/pipeline (siehe Vorgabe Punkt 9): alle Pipelines inklusive
// ihrer nicht gelöschten Stufen in Positionsreihenfolge - eine Query statt
// einer pro Pipeline/Stufe.
export async function listPipelinesForAdmin() {
  return prisma.pipeline.findMany({
    orderBy: { name: "asc" },
    include: {
      stages: { where: { deletedAt: null }, orderBy: { position: "asc" } },
    },
  });
}

export async function getStageById(id: string) {
  return prisma.pipelineStage.findFirst({
    where: { id, deletedAt: null },
    include: { pipeline: { select: { id: true, name: true } } },
  });
}
