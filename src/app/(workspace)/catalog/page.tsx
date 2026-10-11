import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  Box,
  Boxes,
  CircleCheck,
  Link2,
  Package,
  Plus,
  Search,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { CopyCatalogLink } from "@/components/catalog/copy-catalog-link";
import { Button } from "@/components/ui/button";
import { getBusinessContext } from "@/server/modules/business/context";
import type { CatalogItem } from "@/server/modules/catalog/queries";
import {
  CATALOG_PER_PAGE,
  getCatalogSummary,
  listCatalogItems,
} from "@/server/modules/catalog/queries";
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
  const [{ items, page, total, totalPages }, summary, context] = await Promise.all([
    listCatalogItems(search, requestedPage),
    getCatalogSummary(),
    getBusinessContext(),
  ]);
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("page", String(target));
    return `/catalog?${params.toString()}`;
  };

  return (
    <section className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--brand)]">
            Workspace{" "}
            <span aria-hidden="true" className="px-1 text-[var(--muted-foreground)]">
              ›
            </span>{" "}
            Catalog
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
            Products &amp; services
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
            Manage reusable items and their default pricing and GST settings.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/catalog/new">
            <Plus aria-hidden="true" />
            Add item
          </Link>
        </Button>
      </div>

      {context.status === "ready" ? (
        <aside className="rounded-2xl border border-[#cfe7dc] bg-[linear-gradient(110deg,#e8f6ef,#f5fbf8)] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[var(--brand)] ring-1 ring-[#cfe7dc]">
                <Link2 aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">Your public catalog</h2>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Share it with customers. Only published, active items appear.
                </p>
                <p className="mt-3 break-all rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 font-mono text-xs text-[var(--muted-foreground)] sm:max-w-xl">
                  /c/{context.business.public_catalog_slug}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-14 sm:shrink-0 sm:pl-0">
              <CopyCatalogLink path={`/c/${context.business.public_catalog_slug}`} />
              <Button asChild size="sm" variant="secondary">
                <Link href={`/c/${context.business.public_catalog_slug}`}>
                  Open catalog
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </aside>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard icon={Boxes} label="Active items" value={summary.total} tone="green" />
        <SummaryCard icon={Box} label="Products" value={summary.products} tone="blue" />
        <SummaryCard icon={Wrench} label="Services" value={summary.services} tone="amber" />
        <SummaryCard
          icon={CircleCheck}
          label="On public catalog"
          value={summary.published}
          tone="green"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_1px_2px_rgb(15_45_36/4%)]">
        <form
          action="/catalog"
          method="get"
          className="flex flex-col gap-3 border-b border-[var(--line)] p-3 sm:flex-row sm:items-center sm:p-4"
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search products and services</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
            />
            <input
              id="catalog-search"
              name="q"
              type="search"
              maxLength={100}
              defaultValue={search}
              placeholder="Search by name, description, or HSN/SAC"
              className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-white py-2 pl-10 pr-3 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-3 focus:ring-[var(--ring)]/20"
            />
          </label>
          <div className="flex items-center gap-2">
            <Button className="flex-1 sm:flex-none" type="submit" variant="secondary">
              Search
            </Button>
            {search ? (
              <Button asChild variant="ghost">
                <Link href="/catalog">Clear</Link>
              </Button>
            ) : null}
          </div>
        </form>

        {items.length ? (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="bg-[#f7faf8] text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Item</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">HSN / SAC</th>
                    <th className="px-4 py-3 font-semibold">Price</th>
                    <th className="px-4 py-3 font-semibold">GST</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {items.map((item) => (
                    <CatalogTableRow item={item} key={item.id} />
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-[var(--line)] xl:hidden">
              {items.map((item) => (
                <CatalogCard item={item} key={item.id} />
              ))}
            </ul>

            <nav
              aria-label="Catalog pages"
              className="flex flex-col gap-3 border-t border-[var(--line)] px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <p className="text-[var(--muted-foreground)]">
                Showing {(page - 1) * CATALOG_PER_PAGE + 1}–
                {Math.min(page * CATALOG_PER_PAGE, total)} of {total} items
              </p>
              {totalPages > 1 ? (
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  {page > 1 ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={pageHref(page - 1)}>Previous</Link>
                    </Button>
                  ) : (
                    <Button disabled size="sm" variant="outline">
                      Previous
                    </Button>
                  )}
                  <span className="px-2 text-xs text-[var(--muted-foreground)]">
                    Page {page} of {totalPages}
                  </span>
                  {page < totalPages ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={pageHref(page + 1)}>Next</Link>
                    </Button>
                  ) : (
                    <Button disabled size="sm" variant="outline">
                      Next
                    </Button>
                  )}
                </div>
              ) : null}
            </nav>
          </>
        ) : (
          <div className="px-5 py-12 text-center sm:py-16">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[var(--mint)] text-[var(--brand)]">
              <Package aria-hidden="true" className="size-6" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">
              {search ? "No items found" : "Your catalog is empty"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
              {search
                ? "Try a different name, description, or HSN/SAC code."
                : "Add products and services your business offers, with reusable defaults for future documents."}
            </p>
            {!search ? (
              <Button asChild className="mt-5">
                <Link href="/catalog/new">
                  <Plus aria-hidden="true" />
                  Add your first item
                </Link>
              </Button>
            ) : (
              <Button asChild className="mt-5" variant="outline">
                <Link href="/catalog">Clear search</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "green" | "blue" | "amber";
}) {
  const iconClass = {
    green: "bg-[#e4f4ed] text-[#11745e]",
    blue: "bg-[#e8f1ff] text-[#2765b2]",
    amber: "bg-[#fff1dc] text-[#a35a00]",
  }[tone];
  return (
    <article className="min-w-0 rounded-xl border border-[var(--line)] bg-white p-3.5 sm:rounded-2xl sm:p-4">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-[var(--muted-foreground)] sm:text-sm">
            {label}
          </p>
          <p className="mt-1 tabular-nums text-xl font-semibold tracking-tight sm:text-2xl">
            {value}
          </p>
        </div>
      </div>
    </article>
  );
}

function CatalogTableRow({ item }: { item: CatalogItem }) {
  return (
    <tr className="group transition-colors hover:bg-[#fbfdfc]">
      <td className="max-w-[360px] px-5 py-3.5">
        <Link
          href={`/catalog/${item.id}`}
          className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <span className="block truncate font-semibold text-[var(--ink)] group-hover:text-[var(--brand)]">
            {item.name}
          </span>
          <span className="mt-1 block truncate text-xs text-[var(--muted-foreground)]">
            {item.description || item.unit_label || "No description"}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3.5">
        <TypeBadge kind={item.kind} />
      </td>
      <td className="px-4 py-3.5 text-[var(--muted-foreground)]">{item.hsn_sac || "—"}</td>
      <td className="px-4 py-3.5">
        <span className="block whitespace-nowrap font-medium tabular-nums">
          {formatPaise(item.default_unit_price_minor)}
        </span>
        {item.unit_label ? (
          <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
            / {item.unit_label}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3.5">
        <GstBadge item={item} />
      </td>
      <td className="px-4 py-3.5">
        <PublicationBadge published={item.is_published ?? false} />
      </td>
      <td className="px-4 py-3.5 text-right">
        <Button asChild size="icon-sm" variant="ghost">
          <Link aria-label={`View ${item.name}`} href={`/catalog/${item.id}`}>
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </td>
    </tr>
  );
}

function CatalogCard({ item }: { item: CatalogItem }) {
  return (
    <li className="p-4 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <TypeIcon kind={item.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <Link
                href={`/catalog/${item.id}`}
                className="block break-words text-sm font-semibold hover:text-[var(--brand)]"
              >
                {item.name}
              </Link>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">
                {item.description || "No description"}
              </p>
            </div>
            <PublicationBadge published={item.is_published ?? false} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <TypeBadge kind={item.kind} />
            <GstBadge item={item} />
            {item.hsn_sac ? <span>HSN/SAC {item.hsn_sac}</span> : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
            <p className="min-w-0 truncate text-sm font-semibold tabular-nums">
              {formatPaise(item.default_unit_price_minor)}
              {item.unit_label ? (
                <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">
                  / {item.unit_label}
                </span>
              ) : null}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/catalog/${item.id}`}>View item</Link>
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

function TypeIcon({ kind }: { kind: CatalogItem["kind"] }) {
  const Icon = kind === "product" ? Box : Wrench;
  const tone =
    kind === "product" ? "bg-[#fff1dc] text-[#a35a00]" : "bg-[#e8f1ff] text-[#2765b2]";
  return (
    <span
      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}
    >
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}

function TypeBadge({ kind }: { kind: CatalogItem["kind"] }) {
  const isProduct = kind === "product";
  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-medium ${isProduct ? "bg-[#fff1dc] text-[#824b00]" : "bg-[#e8f1ff] text-[#245a9b]"}`}
    >
      {isProduct ? "Product" : "Service"}
    </span>
  );
}

function GstBadge({ item }: { item: CatalogItem }) {
  const category = item.default_gst_category;
  const text =
    category === "no_gst"
      ? "No GST"
      : category === "exempt"
        ? "Exempt"
        : `Taxable · ${item.default_gst_rate}%`;
  const tone =
    category === "taxable" ? "bg-[#e8f1ff] text-[#245a9b]" : "bg-[#e4f4ed] text-[#17634f]";
  return (
    <span
      className={`inline-flex min-h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${tone}`}
    >
      {text}
    </span>
  );
}

function PublicationBadge({ published }: { published: boolean }) {
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${published ? "bg-[#e4f4ed] text-[#17634f]" : "bg-[#f0f3f1] text-[#53645d]"}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${published ? "bg-[#15956f]" : "bg-[#75837d]"}`}
      />
      {published ? "Published" : "Draft"}
    </span>
  );
}
