import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/server/rbac";
import { requirePagePermission } from "@/server/page-permissions";
import { listTagsForAdmin } from "@/modules/tags/queries";
import { TagCreateForm } from "@/modules/tags/components/tag-create-form";
import { TagRowActions } from "@/modules/tags/components/tag-row-actions";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { dateStyle: "short" });

export const metadata: Metadata = {
  title: "Tags verwalten – RDEvolution CRM",
};

export default async function TagsSettingsPage() {
  const user = await requireUser();
  requirePagePermission(user, "TAG_MANAGE");

  const tags = await listTagsForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Tags verwalten</h2>

      <Card>
        <div className="p-4">
          <TagCreateForm />
        </div>
      </Card>

      <Card>
        {tags.length === 0 ? (
          <EmptyState title="Noch keine Tags vorhanden." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Verwendet von</TableHead>
                <TableHead>Erstellt am</TableHead>
                <TableHead>
                  <span className="sr-only">Aktionen</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell className="font-medium text-black">{tag.name}</TableCell>
                  <TableCell className="text-sm text-secondary">
                    {tag._count.companies} Unternehmen · {tag._count.contacts} Kontakte
                  </TableCell>
                  <TableCell>{DATE_FORMATTER.format(tag.createdAt)}</TableCell>
                  <TableCell>
                    <TagRowActions tagId={tag.id} currentName={tag.name} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
