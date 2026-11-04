import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import { effectiveQuoteStatus, QUOTE_STATUS_LABELS } from "../helpers";
import { formatCentsAsEuro } from "@/lib/money";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
export async function QuoteContextSection({
  context,
  assignedUserId,
}: {
  context: { companyId?: string; contactId?: string; dealId?: string };
  assignedUserId?: string | null;
}) {
  await requireUser();
  const quotes = await prisma.quote.findMany({
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
        <CardTitle>Angebote</CardTitle>
        <Link href={`/quotes/new?${params}`} className="text-sm underline">
          Angebot erstellen
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {quotes.length === 0 ? (
          <p className="text-muted">Noch keine Angebote vorhanden.</p>
        ) : (
          quotes.map((q) => (
            <Link key={q.id} href={`/quotes/${q.id}`} className="break-words underline">
              {q.quoteNumber} · {QUOTE_STATUS_LABELS[effectiveQuoteStatus(q)]} ·{" "}
              {formatCentsAsEuro(q.totalCents)}
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
