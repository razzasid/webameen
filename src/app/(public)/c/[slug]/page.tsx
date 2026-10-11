import {
  ArrowLeft,
  ArrowRight,
  BadgeIndianRupee,
  Headset,
  Info,
  Package,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicCatalogShell } from "@/components/catalog/public-catalog-shell";
import {
  getPublicCatalog,
  listPublicCatalogItems,
} from "@/server/modules/catalog/public-queries";
import { allowPublicCatalogRequest } from "@/server/modules/catalog/public-rate-limit";
import { CATALOG_PER_PAGE } from "@/server/modules/catalog/queries";
import { formatPaise } from "@/server/modules/catalog/validation";

export default async function PublicCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { slug } = await params;
  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get("x-real-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown-client";
  if (!allowPublicCatalogRequest(clientAddress)) notFound();
  const { page: pageParam } = await searchParams;
  const requestedPage =
    typeof pageParam === "string" && /^\d{1,6}$/.test(pageParam) ? Number(pageParam) : 1;
  const catalog = await getPublicCatalog(slug);
  const { items, page, totalPages } = await listPublicCatalogItems(catalog, requestedPage);
  const itemRangeStart = items.length ? (page - 1) * CATALOG_PER_PAGE + 1 : 0;
  const itemRangeEnd = itemRangeStart + items.length - 1;

  return (
    <PublicCatalogShell catalog={catalog}>
      <section className="grid gap-7 rounded-2xl border border-[var(--line)] bg-[var(--canvas)]/70 p-5 sm:rounded-3xl sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--brand)]">
            Catalog
          </p>
          <h1 className="mt-3 break-words text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl lg:text-5xl">
            Products &amp; Services
          </h1>
          <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">
            Explore what {catalog.business_name} offers. Open an item to see its details,
            pricing and tax information.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:gap-0">
          {[
            {
              title: "Published items",
              description: "Browse current offerings",
              icon: Package,
            },
            {
              title: "Clear pricing",
              description: "See available prices upfront",
              icon: BadgeIndianRupee,
            },
            {
              title: "Tax details",
              description: "GST information on each item",
              icon: ShieldCheck,
            },
          ].map(({ title, description, icon: Icon }, index) => (
            <div
              className={`flex items-center gap-3 rounded-xl bg-white/70 p-3 sm:flex-col sm:items-center sm:bg-transparent sm:p-2 sm:text-center lg:rounded-none ${index > 0 ? "sm:border-l sm:border-[var(--line)]" : ""}`}
              key={title}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--mint)] text-[var(--brand)]">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-[var(--ink)]">
                  {title}
                </span>
                <span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">
                  {description}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section id="catalog-items" className="scroll-mt-24 pt-7 sm:pt-9">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)] sm:text-xl">
              Available products &amp; services
            </h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {catalog.item_count} {catalog.item_count === 1 ? "item" : "items"} published
            </p>
          </div>
          {items.length > 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Showing {itemRangeStart}–{itemRangeEnd} of {catalog.item_count}
            </p>
          ) : null}
        </div>
        {items.length ? (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <li key={item.id} className="min-w-0">
                  <Link
                    href={`/c/${catalog.slug}/${item.id}`}
                    className="group flex h-full min-h-72 min-w-0 flex-col rounded-2xl border border-[var(--line)] bg-white p-5 transition-colors hover:border-[var(--brand)] hover:bg-[var(--paper)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 sm:p-6"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-xs font-semibold uppercase tracking-wide ${item.kind === "product" ? "bg-sky-50 text-sky-800" : "bg-[var(--mint)] text-[var(--brand-dark)]"}`}
                      >
                        {item.kind === "product" ? (
                          <Package aria-hidden="true" className="size-4" />
                        ) : (
                          <Wrench aria-hidden="true" className="size-4" />
                        )}
                        {item.kind}
                      </span>
                      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[var(--mint)]/70 text-[var(--brand)]">
                        {item.kind === "product" ? (
                          <Package aria-hidden="true" className="size-6" />
                        ) : (
                          <Headset aria-hidden="true" className="size-6" />
                        )}
                      </span>
                    </div>
                    <div className="mt-4 min-w-0">
                      <h3 className="break-words text-lg font-semibold tracking-tight text-[var(--ink)] sm:text-xl">
                        {item.name}
                      </h3>
                      <p className="mt-2 line-clamp-3 min-h-6 break-words text-sm leading-6 text-[var(--muted-foreground)]">
                        {item.description ||
                          `${item.kind === "product" ? "Product" : "Service"} details available.`}
                      </p>
                    </div>
                    <div className="mt-auto border-t border-[var(--line)] pt-4">
                      <p className="break-words text-xl font-semibold tabular-nums text-[var(--ink)] sm:text-2xl">
                        {item.price_minor === null
                          ? "Ask for pricing"
                          : formatPaise(item.price_minor)}
                      </p>
                      {item.unit_label ? (
                        <p className="mt-1 break-words text-sm text-[var(--muted-foreground)]">
                          per {item.unit_label}
                        </p>
                      ) : null}
                      <span className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-semibold text-white transition-colors group-hover:bg-[var(--brand-dark)]">
                        View details
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {totalPages > 1 ? (
              <nav
                aria-label="Public catalog pages"
                className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm"
              >
                {page > 1 ? (
                  <Link
                    href={`/c/${catalog.slug}?page=${page - 1}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 font-medium hover:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" /> Previous
                  </Link>
                ) : null}
                <span className="px-2 text-[var(--muted-foreground)]">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={`/c/${catalog.slug}?page=${page + 1}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 font-medium hover:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    Next <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        ) : (
          <section className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-5 py-12 text-center">
            <h2 className="text-lg font-semibold">No items available yet</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              This business has not published any items. Please check back later.
            </p>
          </section>
        )}
      </section>
      <aside className="mt-6 flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-800">
          <Info aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ink)]">
            Prices are shown before GST where applicable.
          </p>
          <p className="mt-1 text-sm leading-5 text-[var(--muted-foreground)]">
            Open an item to review its tax treatment and full details.
          </p>
        </div>
      </aside>
    </PublicCatalogShell>
  );
}
