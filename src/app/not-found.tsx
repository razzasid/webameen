import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="max-w-md rounded-3xl border border-[var(--line)] bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
          Page not found
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          That page is not here
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          The address may have changed, or the page may not be part of this foundation yet.
        </p>
        <Link
          className="mt-6 inline-flex rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
          href="/dashboard"
        >
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
