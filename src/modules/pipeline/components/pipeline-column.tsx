"use client";

import { useDroppable } from "@dnd-kit/core";
import { formatCentsAsEuro } from "@/lib/money";
import { LeadCard, type BoardLead } from "./lead-card";

export type BoardStage = {
  id: string;
  name: string;
  isWonStage: boolean;
  isLostStage: boolean;
};

type PipelineColumnProps = {
  stage: BoardStage;
  leads: BoardLead[];
};

export function PipelineColumn({ stage, leads }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totalCents = leads.reduce((sum, lead) => sum + (lead.expectedValueCents ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col gap-2 rounded-lg border p-2 ${
        isOver ? "border-[var(--gold)] bg-[var(--gold)]/5" : "border-black/10 bg-black/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between px-1 pt-1">
        <h3 className="text-sm font-medium text-black">{stage.name}</h3>
        <span className="text-xs text-muted">{leads.length}</span>
      </div>
      <p className="px-1 text-xs text-muted">{formatCentsAsEuro(totalCents)}</p>
      <div className="flex min-h-16 flex-col gap-2 overflow-y-auto">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}
