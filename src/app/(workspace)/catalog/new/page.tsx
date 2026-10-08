import Link from "next/link";
import { CatalogForm } from "@/components/catalog/catalog-form";
import { createCatalogItemAction } from "@/server/modules/catalog/actions";
import { listGstRateOptions } from "@/server/modules/catalog/queries";

export default async function NewCatalogItemPage() {
  const rates = await listGstRateOptions();
  return (
    <section>
      <Link
        href="/catalog"
        className="text-sm font-medium text-[var(--brand)] hover:underline"
      >
        ← Products &amp; services
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Add catalog item</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Save a product or service and its default details for future use.
      </p>
      <CatalogForm
        action={createCatalogItemAction}
        rates={rates}
        submitLabel="Create item"
      />
    </section>
  );
}
