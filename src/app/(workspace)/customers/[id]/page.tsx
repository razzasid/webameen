import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { stateLabel } from "@/server/modules/business/states";
import { gstinStateWarning } from "@/server/modules/business/validation";
import { formatPaise } from "@/server/modules/catalog/validation";
import { getCustomerTimeline } from "@/server/modules/customers/history-queries";
import { getCustomer } from "@/server/modules/customers/queries";

function formatTimelineDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { id } = await params;
  const { page: pageValue } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const requestedPage =
    typeof pageValue === "string" && /^\d{1,6}$/.test(pageValue) ? Number(pageValue) : 1;
  const [customer, history] = await Promise.all([
    getCustomer(id),
    getCustomerTimeline(id, requestedPage),
  ]);
  const gstinWarning = customer.state_code
    ? gstinStateWarning(customer.gstin, customer.state_code)
    : null;
  const rows = [
    ["Contact name", customer.contact_name],
    ["Phone", customer.phone],
    ["Email", customer.email],
    ["Address", customer.billing_address],
    ["State", customer.state_code ? stateLabel(customer.state_code) : null],
    [
      "GSTIN applicable",
      customer.gstin_applicable === null ? null : customer.gstin_applicable ? "Yes" : "No",
    ],
    ["GSTIN", customer.gstin],
  ] as const;
  const pageHref = (page: number) => `/customers/${customer.id}?page=${page}`;

  return (
    <section className="space-y-6">
      <Link
        href="/customers"
        className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[var(--brand)] hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Customers
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--brand)]">Customer</p>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
            {customer.display_name}
          </h1>
          <p className="mt-1 break-all text-xs text-[var(--muted-foreground)]">
            Customer record · {customer.id}
          </p>
        </div>
        <Button asChild>
          <Link href={`/customers/${customer.id}/edit`}>Edit customer</Link>
        </Button>
      </div>
      {customer.archived_at ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          This customer is archived.
        </p>
      ) : null}
      {gstinWarning ? (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {gstinWarning}
        </p>
      ) : null}
      <Card className="max-w-4xl">
        <CardHeader className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
          <CardTitle>Customer information</CardTitle>
          <CardDescription>Current contact and GST details.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <dl className="grid gap-px bg-[var(--line)] sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div className="min-w-0 bg-white px-4 py-4 sm:px-5" key={label}>
                <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                  {label}
                </dt>
                <dd className="mt-1.5 break-words whitespace-pre-line text-sm font-medium">
                  {value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card className="max-w-4xl">
        <CardHeader className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
          <CardTitle>Document and payment history</CardTitle>
          <CardDescription>
            Quotations, invoices, payments, reversals and receipts for this customer.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {history.events.length ? (
            <ol className="divide-y divide-[var(--line)]">
              {history.events.map((event) => (
                <li key={event.id}>
                  <Link
                    className="flex min-h-[68px] min-w-0 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] sm:px-5"
                    href={event.href}
                  >
                    <span className="min-w-0">
                      <strong className="block break-words text-sm font-medium">
                        {event.title}
                      </strong>
                      <span className="mt-1 block break-words text-xs text-[var(--muted-foreground)]">
                        {event.detail}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {event.amountMinor ? (
                        <span className="block font-mono text-sm font-semibold tabular-nums">
                          {formatPaise(event.amountMinor)}
                        </span>
                      ) : null}
                      <time
                        className="mt-1 block text-[11px] text-[var(--muted-foreground)]"
                        dateTime={event.occurredAt}
                      >
                        {formatTimelineDate(event.occurredAt, history.timeZone)}
                      </time>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="px-5 py-9 text-center">
              <p className="text-sm font-medium">No document activity yet</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                A quotation or invoice for this customer will appear here.
              </p>
            </div>
          )}
        </CardContent>
        {history.total ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--muted-foreground)] sm:px-5">
            <p>
              Page {history.page} of {history.totalPages} · {history.total} events
            </p>
            <div className="flex gap-2">
              {history.page > 1 ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={pageHref(history.page - 1)}>
                    <ArrowLeft aria-hidden="true" /> Previous
                  </Link>
                </Button>
              ) : null}
              {history.page < history.totalPages ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={pageHref(history.page + 1)}>
                    Next <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
      <p className="max-w-4xl text-xs leading-5 text-[var(--muted-foreground)]">
        Customer details are maintained as a master record. Existing quotation and invoice
        snapshots remain unchanged when this record is updated.
      </p>
    </section>
  );
}
