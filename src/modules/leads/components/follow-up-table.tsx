import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LeadsIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { contactDisplayName } from "@/modules/contacts/helpers";
import { LEAD_STATUS_LABELS } from "@/lib/crm-labels";
import { isLeadFollowUpOverdue } from "../stage-status";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
});

type FollowUpLead = {
  id: string;
  title: string;
  status: "OPEN" | "WON" | "LOST" | "ARCHIVED";
  nextFollowUpAt: Date | null;
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string | null; lastName: string | null } | null;
  stage: { name: string };
  assignedUser: { firstName: string; lastName: string } | null;
};

type FollowUpTableProps = {
  leads: FollowUpLead[];
};

export function FollowUpTable({ leads }: FollowUpTableProps) {
  if (leads.length === 0) {
    return (
      <EmptyState icon={<LeadsIcon className="h-8 w-8" />} title="Keine fälligen Follow-ups." />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lead</TableHead>
          <TableHead>Unternehmen</TableHead>
          <TableHead>Kontakt</TableHead>
          <TableHead>Follow-up</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Pipeline-Stufe</TableHead>
          <TableHead>Verantwortlicher</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => {
          const overdue = isLeadFollowUpOverdue(lead);
          return (
            <TableRow key={lead.id}>
              <TableCell className="font-medium text-black">
                <Link href={`/leads/${lead.id}`} className="hover:underline">
                  {lead.title}
                </Link>
              </TableCell>
              <TableCell>
                {lead.company ? (
                  <Link href={`/companies/${lead.company.id}`} className="hover:underline">
                    {lead.company.name}
                  </Link>
                ) : (
                  "–"
                )}
              </TableCell>
              <TableCell>
                {lead.contact ? (
                  <Link href={`/contacts/${lead.contact.id}`} className="hover:underline">
                    {contactDisplayName(lead.contact)}
                  </Link>
                ) : (
                  "–"
                )}
              </TableCell>
              <TableCell>
                <span className={overdue ? "font-medium text-red-600" : undefined}>
                  {lead.nextFollowUpAt ? DATE_FORMATTER.format(lead.nextFollowUpAt) : "–"}
                  {overdue && " (überfällig)"}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="neutral">{LEAD_STATUS_LABELS[lead.status]}</Badge>
              </TableCell>
              <TableCell>{lead.stage.name}</TableCell>
              <TableCell>
                {lead.assignedUser
                  ? `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}`
                  : "–"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
