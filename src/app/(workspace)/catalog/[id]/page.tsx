import Link from "next/link";
import { getCatalogItem } from "@/server/modules/catalog/queries";
import { formatPaise } from "@/server/modules/catalog/validation";

export default async function CatalogItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getCatalogItem(id);
  const category =
    item.default_gst_category === "no_gst"
      ? "No GST"
      : item.default_gst_category === "exempt"
        ? "Exempt"
        : `Taxable · ${item.default_gst_rate}%`;

  return (
    <section>
      <Link
        href="/catalog"
        className="text-sm font-medium text-[var(--brand)] hover:underline"
      >
        ← Products &amp; services
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--brand)]">
            {item.kind === "product" ? "Product" : "Service"}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{item.name}</h1>
        </div>
        <Link
          href={`/catalog/${item.id}/edit`}
          className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          Edit item
        </Link>
      </div>
      {item.archived_at ? (
        <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          This item is archived and is not shown in the active catalog list.
        </p>
      ) : null}
      <dl className="mt-6 grid max-w-3xl gap-4 rounded-2xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2">
        <Detail label="Unit label" value={item.unit_label || "Not set"} />
        <Detail
          label="Default unit price"
          value={formatPaise(item.default_unit_price_minor)}
        />
        <Detail label="Default GST category" value={category} />
        <Detail label="HSN / SAC" value={item.hsn_sac || "Not set"} />
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Description
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm">
            {item.description || "Not set"}
          </dd>
        </div>
      </dl>
      <p className="mt-4 max-w-3xl text-xs leading-5 text-[var(--muted)]">
        These are defaults for future documents. Editing this item does not change any
        existing quotation or invoice snapshots.
      </p>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
