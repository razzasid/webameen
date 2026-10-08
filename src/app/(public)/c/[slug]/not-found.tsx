export default function PublicCatalogNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-5 py-12">
      <section className="w-full rounded-3xl border border-[var(--line)] bg-white p-7 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)]">
          Public catalog
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Catalog or item unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          This link may be incorrect, or the item may no longer be published. Ask the
          business for an updated link.
        </p>
      </section>
    </main>
  );
}
