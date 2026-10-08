import Link from "next/link";
import { CatalogForm } from "@/components/catalog/catalog-form";
import { updateCatalogItemAction } from "@/server/modules/catalog/actions";
import { getCatalogItem, listGstRateOptions } from "@/server/modules/catalog/queries";
import { paiseToRupees } from "@/server/modules/catalog/validation";

export default async function EditCatalogItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [item, rates] = await Promise.all([getCatalogItem(id), listGstRateOptions()]);
  const action = updateCatalogItemAction.bind(null, item.id);
  const initial = {
    kind: item.kind,
    name: item.name,
    description: item.description ?? "",
    unitLabel: item.unit_label ?? "",
    defaultPrice: paiseToRupees(item.default_unit_price_minor),
    gstCategory: item.default_gst_category,
    gstRate: item.default_gst_rate === null ? "" : String(item.default_gst_rate),
    hsnSac: item.hsn_sac ?? "",
  };
  return (
    <section>
      <Link
        href={`/catalog/${item.id}`}
        className="text-sm font-medium text-[var(--brand)] hover:underline"
      >
        ← {item.name}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Edit catalog item</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Changes apply to future use of this item.
      </p>
      <CatalogForm
        action={action}
        initial={initial}
        rates={rates}
        submitLabel="Save changes"
      />
    </section>
  );
}
