"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="max-w-md rounded-3xl border border-[var(--line)] bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
          Something went wrong
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          This page could not load
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Try again. If the problem continues, return to the dashboard.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
            onClick={() => reset()}
            type="button"
          >
            Try again
          </button>
          <a
            className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold"
            href="/dashboard"
          >
            Dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
