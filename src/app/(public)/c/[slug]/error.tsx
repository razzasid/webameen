"use client";

export default function PublicCatalogError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="text-2xl font-semibold">We couldn't load this catalog</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">Please try again in a moment.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </main>
  );
}
