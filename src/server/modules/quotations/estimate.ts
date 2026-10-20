import { rupeesToPaise } from "@/server/modules/catalog/validation";
import type { QuoteLineInput } from "./validation";

// Mirrors exclusive-price line rounding. The saved server calculation remains authoritative.
export function estimateQuotationTotal(lines: QuoteLineInput[], treatment: string) {
  let total = BigInt(0);
  let complete = lines.length > 0;
  const lineTotals = lines.map((line) => {
    try {
      if (
        !line.description.trim() ||
        !/^\d{1,12}(?:\.\d{1,3})?$/.test(line.quantity.trim())
      )
        throw new Error();
      const price = rupeesToPaise(line.unitPriceRupees);
      if (price === null) throw new Error();
      const [whole, fraction = ""] = line.quantity.trim().split(".");
      const quantity = BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0"));
      if (quantity <= BigInt(0)) throw new Error();
      const base = (quantity * BigInt(price) + BigInt(500)) / BigInt(1000);
      let tax = BigInt(0);
      if (line.gstCategory === "taxable") {
        if (
          !/^\d+(?:\.\d+)?$/.test(line.gstRate.trim()) ||
          !["cgst_sgst", "igst"].includes(treatment)
        )
          throw new Error();
        const [rateWhole, rateFraction = ""] = line.gstRate.trim().split(".");
        const rateScale = BigInt(10) ** BigInt(rateFraction.length);
        const rate = BigInt(rateWhole) * rateScale + BigInt(rateFraction || "0");
        const divisor = rateScale * (treatment === "cgst_sgst" ? BigInt(200) : BigInt(100));
        tax = (base * rate * BigInt(2) + divisor) / (divisor * BigInt(2));
        if (treatment === "cgst_sgst") tax *= BigInt(2);
      }
      const amount = base + tax;
      total += amount;
      return amount.toString();
    } catch {
      complete = false;
      return null;
    }
  });
  return { totalMinor: total.toString(), complete, lineTotals };
}
