import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import { effectiveInvoiceStatus, INVOICE_STATUS_LABELS } from "../helpers";
import { formatCentsAsEuro } from "@/lib/money";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
export async function InvoiceContextSection({
  context,
  assignedUserId,
}: {
  context: { companyId?: string; contactId?: string; dealId?: string; quoteId?: string };
  assignedUserId?: string | null;
}) {
  await requireUser();
  const invoices = await prisma.invoice.findMany({
    where: { ...context, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
  const params = new URLSearchParams(
    Object.entries({ ...context, assignedUserId }).filter((e): e is [string, string] => !!e[1]),
  );
  return (
    <Card className="text-black">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Rechnungen</CardTitle>
        {!context.quoteId && (
          <Link href={`/invoices/new?${params}`} className="text-sm underline">
            Rechnung erstellen
          </Link>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {invoices.length === 0 ? (
          <p className="text-muted">Noch keine Rechnungen vorhanden.</p>
        ) : (
          invoices.map((q) => (
            <Link key={q.id} href={`/invoices/${q.id}`} className="break-words underline">
              {q.invoiceNumber} · {INVOICE_STATUS_LABELS[effectiveInvoiceStatus(q)]} ·{" "}
              {formatCentsAsEuro(q.totalCents)}
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
