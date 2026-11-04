// Quantity in thousandths, tax in basis points. Positive half-cent rounds up,
// first the line net, then line tax; totals are the sums of rounded lines.
const MAX_CENTS = BigInt(2_147_483_647);
function checked(value: bigint): number {
  if (value < BigInt(0) || value > MAX_CENTS) throw new Error("Angebotsbetrag ist zu groß.");
  return Number(value);
}
export function calculateQuoteItem(input: {
  quantity: number;
  unitPriceCents: number;
  taxRateBasisPoints: number;
}) {
  const { quantity, unitPriceCents, taxRateBasisPoints } = input;
  if (
    ![quantity, unitPriceCents, taxRateBasisPoints].every(Number.isSafeInteger) ||
    quantity <= 0 ||
    unitPriceCents < 0 ||
    ![0, 700, 1900].includes(taxRateBasisPoints)
  )
    throw new Error("Ungültige Position.");
  const net = (BigInt(quantity) * BigInt(unitPriceCents) + BigInt(500)) / BigInt(1000);
  const tax = (net * BigInt(taxRateBasisPoints) + BigInt(5000)) / BigInt(10000);
  return {
    lineSubtotalCents: checked(net),
    lineTaxCents: checked(tax),
    lineTotalCents: checked(net + tax),
  };
}
export function calculateQuoteTotals(items: ReturnType<typeof calculateQuoteItem>[]) {
  let net = BigInt(0),
    tax = BigInt(0);
  for (const item of items) {
    if (
      ![item.lineSubtotalCents, item.lineTaxCents, item.lineTotalCents].every(
        Number.isSafeInteger,
      ) ||
      item.lineSubtotalCents < 0 ||
      item.lineTaxCents < 0 ||
      item.lineTotalCents !== item.lineSubtotalCents + item.lineTaxCents
    )
      throw new Error("Ungültige Summen.");
    net += BigInt(item.lineSubtotalCents);
    tax += BigInt(item.lineTaxCents);
  }
  return { subtotalCents: checked(net), taxCents: checked(tax), totalCents: checked(net + tax) };
}
