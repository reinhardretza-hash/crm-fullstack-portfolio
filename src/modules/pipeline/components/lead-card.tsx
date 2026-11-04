"use client";

import { useDraggable } from "@dnd-kit/core";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { LeadStatus } from "@/generated/prisma/client";
import { POTENTIAL_NEED_LABELS, PRIORITY_LABELS } from "@/lib/crm-labels";
import { formatCentsAsEuro } from "@/lib/money";
import { contactDisplayName } from "@/modules/contacts/helpers";
import { isLeadFollowUpOverdue } from "@/modules/leads/stage-status";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { dateStyle: "short" });

export type BoardLead = {
  id: string;
  title: string;
  interest: keyof typeof POTENTIAL_NEED_LABELS | null;
  priority: keyof typeof PRIORITY_LABELS;
  expectedValueCents: number | null;
  score: number;
  status: LeadStatus;
  nextFollowUpAt: Date | null;
  version: number;
  stageId: string;
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string | null; lastName: string | null } | null;
};

export function LeadCard({ lead }: { lead: BoardLead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
  });
  const overdue = isLeadFollowUpOverdue(lead);

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      aria-roledescription="Ziehbare Lead-Karte"
      className={`flex touch-none flex-col gap-1.5 rounded-md border border-black/10 bg-white p-3 text-left shadow-sm ${isDragging ? "opacity-50" : ""}`}
    >
      <Link
        href={`/leads/${lead.id}`}
        onClick={(event) => event.stopPropagation()}
        className="text-sm font-medium text-black hover:underline"
      >
        {lead.title}
      </Link>
      {lead.company && <p className="text-xs text-muted">{lead.company.name}</p>}
      {lead.contact && <p className="text-xs text-muted">{contactDisplayName(lead.contact)}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {lead.interest && (
          <Badge variant="neutral" className="text-[11px]">
            {POTENTIAL_NEED_LABELS[lead.interest]}
          </Badge>
        )}
        <Badge
          variant={lead.priority === "VERY_HIGH" || lead.priority === "HIGH" ? "gold" : "neutral"}
          className="text-[11px]"
        >
          {PRIORITY_LABELS[lead.priority]}
        </Badge>
        <span className="text-xs font-medium text-black/70">Score {lead.score}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {lead.expectedValueCents !== null ? formatCentsAsEuro(lead.expectedValueCents) : "–"}
        </span>
        {lead.nextFollowUpAt && (
          <span className={overdue ? "font-medium text-red-600" : undefined}>
            {DATE_FORMATTER.format(lead.nextFollowUpAt)}
          </span>
        )}
      </div>
    </div>
  );
}
