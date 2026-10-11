import { ArrowRight } from "lucide-react";
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
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8 sm:py-4">
          <Link
            href={`/c/${catalog.slug}`}
            className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-lg font-bold text-white shadow-sm sm:size-12">
              W
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-semibold tracking-tight text-[var(--ink)] sm:text-xl">
                {catalog.business_name}
              </span>
              <span className="block text-xs text-[var(--muted-foreground)] sm:text-sm">
                Product &amp; Service Catalog
              </span>
            </span>
          </Link>
          <Link
            href={`/c/${catalog.slug}#catalog-items`}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--mint)]/60 px-3.5 text-sm font-semibold text-[var(--brand-dark)] transition hover:bg-[var(--mint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:px-4"
          >
            <span className="hidden sm:inline">Browse catalog</span>
            <span className="sm:hidden">Catalog</span>
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-8 sm:py-8">
        {children}
      </main>
      <footer className="border-t border-[var(--line)] bg-[var(--paper)]/70">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="break-words">Catalog by {catalog.business_name}</p>
          <p>Powered by Webameen</p>
        </div>
      </footer>
    </div>
  );
}
