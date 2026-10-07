import Link from "next/link";

export default function CustomerNotFound() {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white p-8">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        This customer is unavailable in your business.
      </p>
      <Link
        className="mt-5 inline-block text-sm font-medium text-[var(--brand)] hover:underline"
        href="/customers"
      >
        Return to customers
      </Link>
    </section>
  );
}
