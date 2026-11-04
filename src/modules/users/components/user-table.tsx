import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UserRole } from "@/generated/prisma/client";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { dateStyle: "short" });

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  USER: "Benutzer",
};

type UserListItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { assignedLeads: number; assignedDeals: number; assignedTasks: number };
};

type UserTableProps = {
  users: UserListItem[];
};

export function UserTable({ users }: UserTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>E-Mail</TableHead>
          <TableHead>Rolle</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Zugewiesen</TableHead>
          <TableHead>Erstellt am</TableHead>
          <TableHead>Zuletzt geändert</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium text-black">
              <Link href={`/settings/users/${user.id}/edit`} className="hover:underline">
                {user.firstName} {user.lastName}
              </Link>
              {/* Deutlich sichtbarer Hinweis statt nur einer stillen
                  Status-Spalte (siehe Vorgabe Punkt 7: "inaktiv" muss
                  deutlich erkennbar sein). */}
              {!user.isActive && (
                <span className="ml-2 text-xs font-normal text-muted">(inaktiv)</span>
              )}
            </TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
              <Badge variant={user.role === "OWNER" ? "gold" : "neutral"}>
                {ROLE_LABELS[user.role]}
              </Badge>
            </TableCell>
            <TableCell>
              {user.isActive ? (
                <Badge variant="neutral">Aktiv</Badge>
              ) : (
                <Badge variant="neutral" className="bg-red-100 text-red-700">
                  Inaktiv
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-sm text-secondary">
              {user._count.assignedLeads} Leads · {user._count.assignedDeals} Deals ·{" "}
              {user._count.assignedTasks} Aufgaben
            </TableCell>
            <TableCell>{DATE_FORMATTER.format(user.createdAt)}</TableCell>
            <TableCell>{DATE_FORMATTER.format(user.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
