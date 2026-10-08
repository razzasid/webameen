import Link from "next/link";
import { CATALOG_PER_PAGE, listCatalogItems } from "@/server/modules/catalog/queries";
import { formatPaise } from "@/server/modules/catalog/validation";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const { q = "", page: pageParam = "1" } = await searchParams;
  const search = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const requestedPage =
    typeof pageParam === "string" && /^\d{1,6}$/.test(pageParam) ? Number(pageParam) : 1;
  const { items, page, total, totalPages } = await listCatalogItems(search, requestedPage);
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("page", String(target));
    return `/catalog?${params.toString()}`;
  };

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--brand)]">Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
            Products &amp; services
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Manage reusable items and their default pricing and GST settings.
          </p>
        </div>
        <Link
          href="/catalog/new"
          className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          Add item
        </Link>
      </div>

      <form action="/catalog" method="get" className="mt-6 flex max-w-2xl gap-2">
        <label className="sr-only" htmlFor="catalog-search">
          Search catalog
        </label>
        <input
          id="catalog-search"
          name="q"
          type="search"
          maxLength={100}
          defaultValue={search}
          placeholder="Search by item name, description, or HSN/SAC"
          className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]"
        />
        <button
          className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-medium hover:bg-[var(--paper)]"
          type="submit"
        >
          Search
        </button>
      </form>

      {items.length ? (
        <>
          <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
            <ul className="divide-y divide-[var(--line)]">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/catalog/${item.id}`}
                    className="flex flex-wrap items-center justify-between gap-4 p-4 transition hover:bg-[#f8fbf9] md:px-5"
                  >
                    <span className="min-w-48 flex-1">
                      <strong className="block text-sm font-semibold">{item.name}</strong>
                      <span className="mt-1 block text-sm text-[var(--muted)]">
                        {[item.kind === "product" ? "Product" : "Service", item.unit_label]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="text-sm font-medium">
                      {formatPaise(item.default_unit_price_minor)}
                    </span>
                    <span className="rounded-full bg-[var(--mint)] px-3 py-1 text-xs font-medium text-[#22584d]">
                      {item.default_gst_category === "no_gst"
                        ? "No GST"
                        : item.default_gst_category === "exempt"
                          ? "Exempt"
                          : `Taxable · ${item.default_gst_rate}%`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <nav
            aria-label="Catalog pages"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <p className="text-[var(--muted)]">
              Showing {(page - 1) * CATALOG_PER_PAGE + 1}–
              {Math.min(page * CATALOG_PER_PAGE, total)} of {total} items
            </p>
            {totalPages > 1 ? (
              <div className="flex items-center gap-3">
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-medium hover:bg-[var(--paper)]"
                  >
                    Previous
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="rounded-xl border border-[var(--line)] px-4 py-2 text-[var(--muted)]"
                  >
                    Previous
                  </span>
                )}
                <span>
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={pageHref(page + 1)}
                    className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-medium hover:bg-[var(--paper)]"
                  >
                    Next
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="rounded-xl border border-[var(--line)] px-4 py-2 text-[var(--muted)]"
                  >
                    Next
                  </span>
                )}
              </div>
            ) : null}
          </nav>
        </>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--line)] bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">
            {search ? "No items found" : "Your catalog is empty"}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {search
              ? "Try a different name, description, or HSN/SAC code."
              : "Add products and services your business offers, with reusable defaults for future documents."}
          </p>
          {!search ? (
            <Link
              href="/catalog/new"
              className="mt-5 inline-block rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white"
            >
              Add your first item
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
