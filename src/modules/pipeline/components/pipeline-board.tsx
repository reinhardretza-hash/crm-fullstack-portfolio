"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState } from "react";
import { moveLeadStageAction } from "@/modules/leads/actions";
import { deriveLeadStatusFromStage } from "@/modules/leads/stage-status";
import { PipelineColumn, type BoardStage } from "./pipeline-column";
import type { BoardLead } from "./lead-card";

type PipelineBoardProps = {
  stages: BoardStage[];
  initialLeads: BoardLead[];
};

export function PipelineBoard({ stages, initialLeads }: PipelineBoardProps) {
  const [leads, setLeads] = useState<BoardLead[]>(initialLeads);
  const [error, setError] = useState<string | null>(null);

  // PointerSensor für Maus/Touch, KeyboardSensor für Tastaturbedienung
  // (Accessibility) - beide von @dnd-kit/core bereitgestellt.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const leadId = String(active.id);
    const toStageId = String(over.id);
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === toStageId) return;

    const toStage = stages.find((s) => s.id === toStageId);
    if (!toStage) return;

    setError(null);
    const previousLead = lead;

    // Optimistischer Client-Update (siehe Vorgabe) - der Server bleibt die
    // einzige Quelle der Wahrheit; bei Fehler/Konflikt wird unten zurückgesetzt.
    setLeads((current) =>
      current.map((l) =>
        l.id === leadId
          ? { ...l, stageId: toStageId, status: deriveLeadStatusFromStage(toStage) }
          : l,
      ),
    );

    const result = await moveLeadStageAction({ leadId, toStageId, expectedVersion: lead.version });

    if (!result.success) {
      // Client-State bei Fehler zurücksetzen (siehe Vorgabe).
      setLeads((current) => current.map((l) => (l.id === leadId ? previousLead : l)));
      setError(result.error);
      return;
    }

    setLeads((current) =>
      current.map((l) => (l.id === leadId ? { ...l, version: result.version } : l)),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              leads={leads.filter((lead) => lead.stageId === stage.id)}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
