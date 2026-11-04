import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { PaginationControls } from "@/components/filters/pagination-controls";
import { parsePaginationParams } from "@/lib/pagination";
import { requireUser } from "@/server/rbac";
import { requirePagePermission } from "@/server/page-permissions";
import { AuditFiltersBar } from "@/modules/audit/components/audit-filters";
import { AuditTable } from "@/modules/audit/components/audit-table";
import { listAuditLogs } from "@/modules/audit/queries";
import { auditFiltersSchema } from "@/validations/audit";

export const metadata: Metadata = {
  title: "Audit Log – RDEvolution CRM",
};

type AuditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuditSettingsPage({ searchParams }: AuditPageProps) {
  const user = await requireUser();
  requirePagePermission(user, "AUDIT_VIEW");

  const rawParams = await searchParams;
  const filters = auditFiltersSchema.parse(rawParams);
  const pagination = parsePaginationParams(rawParams);

  const { logs, totalCount, totalPages } = await listAuditLogs(filters, pagination);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Audit Log</h2>

      <Suspense>
        <AuditFiltersBar />
      </Suspense>

      <Card>
        <AuditTable logs={logs} />
        {logs.length > 0 && (
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalPages={totalPages}
            totalCount={totalCount}
          />
        )}
      </Card>
    </div>
  );
}
