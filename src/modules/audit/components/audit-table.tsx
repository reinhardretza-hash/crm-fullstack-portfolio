import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sanitizeAuditMetadata } from "../sanitize";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
  timeStyle: "medium",
});

type AuditLogRow = {
  id: string;
  createdAt: Date;
  actorType: "USER" | "SYSTEM";
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  user: { firstName: string; lastName: string } | null;
};

type AuditTableProps = {
  logs: AuditLogRow[];
};

export function AuditTable({ logs }: AuditTableProps) {
  if (logs.length === 0) {
    return <EmptyState title="Keine Audit-Einträge für diese Filter." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Zeitpunkt</TableHead>
          <TableHead>Benutzer</TableHead>
          <TableHead>Aktion</TableHead>
          <TableHead>Entity Type</TableHead>
          <TableHead>Entity ID</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => {
          const metadata = sanitizeAuditMetadata(log.metadata);
          return (
            <TableRow key={log.id}>
              <TableCell>{DATE_TIME_FORMATTER.format(log.createdAt)}</TableCell>
              <TableCell>
                {log.user ? `${log.user.firstName} ${log.user.lastName}` : "System"}
              </TableCell>
              <TableCell className="font-mono text-xs">{log.action}</TableCell>
              <TableCell>{log.entityType}</TableCell>
              <TableCell className="font-mono text-xs text-secondary">
                {log.entityId ?? "–"}
              </TableCell>
              <TableCell className="text-xs text-secondary">
                {metadata
                  ? Object.entries(metadata)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(", ")
                  : "–"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
