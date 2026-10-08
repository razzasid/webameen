import Link from "next/link";
import { PublicCatalogShell } from "@/components/catalog/public-catalog-shell";
import {
  getPublicCatalog,
  listPublicCatalogItems,
} from "@/server/modules/catalog/public-queries";
import { formatPaise } from "@/server/modules/catalog/validation";

export default async function PublicCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const requestedPage =
    typeof pageParam === "string" && /^\d{1,6}$/.test(pageParam) ? Number(pageParam) : 1;
  const catalog = await getPublicCatalog(slug);
  const { items, page, totalPages } = await listPublicCatalogItems(catalog, requestedPage);

  return (
    <PublicCatalogShell catalog={catalog}>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Products &amp; services
        </h1>
        <p className="mt-3 break-words text-sm leading-6 text-[var(--muted)]">
          Explore what {catalog.business_name} offers. Open an item for pricing and details.
        </p>
      </div>
      {items.length ? (
        <>
          <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.id} className="min-w-0">
                <Link
                  href={`/c/${catalog.slug}/${item.id}`}
                  className="flex h-full min-h-52 flex-col rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm transition hover:border-[#77a99a] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand)]"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
                    {item.kind === "product" ? "Product" : "Service"}
                  </span>
                  <h2 className="mt-3 break-words text-lg font-semibold">{item.name}</h2>
                  {item.description ? (
                    <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-[var(--muted)]">
                      {item.description}
                    </p>
                  ) : null}
                  <div className="mt-auto pt-6">
                    <p className="break-words text-lg font-semibold">
                      {item.price_minor === null
                        ? "Ask for pricing"
                        : formatPaise(item.price_minor)}
                    </p>
                    {item.unit_label ? (
                      <p className="mt-1 break-words text-xs text-[var(--muted)]">
                        per {item.unit_label}
                      </p>
                    ) : null}
                    <span className="mt-4 inline-block text-sm font-medium text-[var(--brand)]">
                      View details →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <nav
              aria-label="Public catalog pages"
              className="mt-7 flex flex-wrap items-center justify-center gap-4 text-sm"
            >
              {page > 1 ? (
                <Link
                  href={`/c/${catalog.slug}?page=${page - 1}`}
                  className="rounded-xl border border-[var(--line)] bg-white px-4 py-3"
                >
                  Previous
                </Link>
              ) : null}
              <span>
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={`/c/${catalog.slug}?page=${page + 1}`}
                  className="rounded-xl border border-[var(--line)] bg-white px-4 py-3"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
          <p className="mt-6 text-xs text-[var(--muted)]">
            Prices shown before GST where applicable.
          </p>
        </>
      ) : (
        <section className="mt-7 rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-12 text-center">
          <h2 className="text-lg font-semibold">No items available yet</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            This business has not published any items. Please check back later.
          </p>
        </section>
      )}
    </PublicCatalogShell>
  );
}
