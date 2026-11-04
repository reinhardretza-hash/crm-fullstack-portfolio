import { getCurrentUser } from "@/server/rbac";
import { prisma } from "@/lib/prisma";
import { quotePdfData } from "@/modules/quotes/pdf-data";
import { generateQuotePdf } from "@/modules/quotes/pdf";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!(await getCurrentUser()))
    return new Response("Anmeldung erforderlich.", { status: 401, headers });
  const { id } = await params;
  if (!id || id.length > 100)
    return new Response("Angebot nicht gefunden.", { status: 404, headers });
  const quote = await prisma.quote.findFirst({
    where: { id, deletedAt: null },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!quote) return new Response("Angebot nicht gefunden.", { status: 404, headers });
  const buffer = await generateQuotePdf(quotePdfData(quote));
  const disposition =
    new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  const filename = quote.quoteNumber.replace(/[^A-Z0-9-]/g, "");
  return new Response(new Uint8Array(buffer), {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}.pdf"`,
    },
  });
}
