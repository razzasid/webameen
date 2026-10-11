import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CatalogForm } from "@/components/catalog/catalog-form";
import { createCatalogItemAction } from "@/server/modules/catalog/actions";
import { listGstRateOptions } from "@/server/modules/catalog/queries";

export default async function NewCatalogItemPage() {
  const rates = await listGstRateOptions();
  return (
    <section className="space-y-5 sm:space-y-6">
      <Link
        href="/catalog"
        className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[var(--brand)] hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Products &amp; services
      </Link>
      <div className="-mt-3 min-w-0">
        <h1 className="text-3xl font-bold tracking-[-0.04em] text-[var(--ink)] sm:text-4xl">
          Add catalog item
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">
          Save a product or service and its default details for future use.
        </p>
      </div>
      <CatalogForm
        action={createCatalogItemAction}
        rates={rates}
        submitLabel="Create item"
        variant="create"
      />
    </section>
  );
}
