"use client";

export default function CustomersError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="rounded-2xl border border-red-200 bg-white p-8">
      <h1 className="text-xl font-semibold">Customers couldn’t load</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Please try again in a moment.</p>
      <button
        className="mt-5 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </section>
  );
}
