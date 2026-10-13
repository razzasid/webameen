import { formatPaise } from "@/server/modules/catalog/validation";
import type { SavedQuoteComponent } from "@/server/modules/quotations/validation";

function componentAmountMinor(quantity: string, unitPriceMinor: string) {
  const [whole, fraction = ""] = quantity.split(".", 2);
  const scale = BigInt(1000);
  const quantityThousandths = BigInt(whole) * scale + BigInt(fraction.padEnd(3, "0"));
  return ((quantityThousandths * BigInt(unitPriceMinor) + BigInt(500)) / scale).toString();
}

export function QuotationLineComponents({
  components,
}: {
  components: SavedQuoteComponent[];
}) {
  if (components.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-[var(--line)] bg-[var(--canvas)]/70 p-2 text-xs">
      <p className="font-semibold text-[var(--ink)]">Materials / subproducts</p>
      <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
        Breakdown only; these amounts are not added to the quotation total.
      </p>
      <ul className="mt-1.5 space-y-1">
        {components.map((component) => (
          <li
            key={component.position}
            className="flex flex-wrap justify-between gap-x-3 gap-y-0.5"
          >
            <span className="min-w-0 break-words">
              {component.description} · {component.quantity}
              {component.unit_label ? ` ${component.unit_label}` : ""}
              {` × ${formatPaise(component.unit_price_minor)}`}
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {formatPaise(
                componentAmountMinor(component.quantity, component.unit_price_minor),
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
