"use client";

export default function CatalogError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <h1 className="text-xl font-semibold text-red-900">Catalog unavailable</h1>
      <p className="mt-2 text-sm text-red-800">
        We couldn’t load this catalog page. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </section>
  );
}
