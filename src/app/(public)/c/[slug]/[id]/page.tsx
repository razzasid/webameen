import Link from "next/link";
import { PublicCatalogShell } from "@/components/catalog/public-catalog-shell";
import {
  getPublicCatalog,
  getPublicCatalogItem,
} from "@/server/modules/catalog/public-queries";
import { formatPaise } from "@/server/modules/catalog/validation";

export default async function PublicCatalogItemPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const catalog = await getPublicCatalog(slug);
  const item = await getPublicCatalogItem(slug, id);
  const gst =
    item.gst_category === "taxable"
      ? `GST ${item.gst_rate}% extra`
      : item.gst_category === "exempt"
        ? "GST exempt"
        : "No GST";

  return (
    <PublicCatalogShell catalog={catalog}>
      <Link
        href={`/c/${catalog.slug}`}
        className="inline-block py-2 text-sm font-medium text-[var(--brand)] hover:underline"
      >
        ← All products &amp; services
      </Link>
      <article className="mt-5 max-w-3xl rounded-3xl border border-[var(--line)] bg-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
          {item.kind === "product" ? "Product" : "Service"}
        </p>
        <h1 className="mt-3 break-words text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          {item.name}
        </h1>
        <p className="mt-6 break-words text-2xl font-semibold">
          {item.price_minor === null
            ? "Ask the business for pricing"
            : formatPaise(item.price_minor)}
        </p>
        {item.unit_label ? (
          <p className="mt-1 break-words text-sm text-[var(--muted)]">
            per {item.unit_label}
          </p>
        ) : null}
        <p className="mt-3 inline-block max-w-full break-words rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-medium text-[var(--brand)]">
          {gst}
        </p>
        <section className="mt-7 border-t border-[var(--line)] pt-6">
          <h2 className="text-sm font-semibold">About this {item.kind}</h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--muted)]">
            {item.description ||
              "Contact the business for more information about this item."}
          </p>
        </section>
      </article>
    </PublicCatalogShell>
  );
}
