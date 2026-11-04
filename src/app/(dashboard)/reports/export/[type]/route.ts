import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/rbac";
import { buildExportCsv } from "@/modules/reports/export";
import { resolveReportPeriod } from "@/modules/reports/period";
import { EXPORT_TYPES, listExportRows, type ExportType } from "@/modules/reports/queries";
import { reportFiltersSchema } from "@/validations/report";

type Context = { params: Promise<{ type: string }> };

export async function GET(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Nicht angemeldet.", { status: 401 });

  const { type } = await params;
  if (!(EXPORT_TYPES as readonly string[]).includes(type)) {
    return new NextResponse("Unbekannter Export.", { status: 404 });
  }

  const query = new URL(request.url).searchParams;
  const period = resolveReportPeriod({
    period: query.get("period") ?? undefined,
    from: query.get("from") ?? undefined,
    to: query.get("to") ?? undefined,
  });
  const filters = reportFiltersSchema.parse({ userId: query.get("userId") ?? undefined });

  const rows = await listExportRows(type as ExportType, period, filters);
  const csv = buildExportCsv(type as ExportType, rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-${period.fromKey}_${period.toKey}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
