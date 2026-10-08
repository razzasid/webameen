import Link from "next/link";
import type { PublicCatalog } from "@/server/modules/catalog/public-queries";

export function PublicCatalogShell({
  catalog,
  children,
}: {
  catalog: PublicCatalog;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
            Public catalog
          </p>
          <Link
            href={`/c/${catalog.slug}`}
            className="mt-2 inline-block max-w-full break-words text-xl font-semibold tracking-tight sm:text-2xl"
          >
            {catalog.business_name}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">{children}</main>
      <footer className="mx-auto max-w-6xl break-words px-5 pb-8 text-xs text-[var(--muted)] sm:px-8">
        Catalog by {catalog.business_name} · Powered by Webameen
      </footer>
    </div>
  );
}
