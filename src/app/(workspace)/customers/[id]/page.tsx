import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  FileText,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
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
    { label: "Contact name", value: customer.contact_name, icon: UserRound },
    { label: "Phone", value: customer.phone, icon: Phone },
    { label: "Email", value: customer.email, icon: Mail },
    { label: "Address", value: customer.billing_address, icon: MapPin },
    {
      label: "State",
      value: customer.state_code ? stateLabel(customer.state_code) : null,
      icon: Building2,
    },
    {
      label: "GSTIN applicable",
      value:
        customer.gstin_applicable === null
          ? null
          : customer.gstin_applicable
            ? "Yes"
            : "No",
      icon: FileText,
    },
    { label: "GSTIN", value: customer.gstin, icon: ShieldCheck },
  ] as const;
  const summary = [
    {
      label: "State",
      value: customer.state_code ? stateLabel(customer.state_code) : "Not provided",
      icon: Building2,
    },
    {
      label: "GSTIN applicable",
      value:
        customer.gstin_applicable === null
          ? "Not specified"
          : customer.gstin_applicable
            ? "Yes"
            : "No",
      icon: BadgeCheck,
    },
    { label: "GSTIN", value: customer.gstin || "—", icon: ShieldCheck },
  ] as const;
  const pageHref = (page: number) => `/customers/${customer.id}?page=${page}`;

  return (
    <section className="space-y-5 sm:space-y-6">
      <div className="space-y-4">
        <Link
          href="/customers"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[var(--brand)] hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Customers
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--brand)]">Customer profile</p>
            <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
              {customer.display_name}
            </h1>
            <p className="mt-2 inline-flex max-w-full items-center rounded-full bg-[var(--canvas)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">
              Customer ID: <span className="ml-1 break-all">{customer.id}</span>
            </p>
          </div>
          <Button asChild className="w-full shrink-0 sm:w-auto">
            <Link href={`/customers/${customer.id}/edit`}>Edit customer</Link>
          </Button>
        </div>
      </div>
      {customer.archived_at ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          This customer is archived.
        </p>
      ) : null}
      <Card className="overflow-hidden">
        <CardContent className="grid gap-0 p-0 sm:grid-cols-3">
          {summary.map(({ label, value, icon: Icon }, index) => (
            <div
              className={`flex min-w-0 items-center gap-3 px-4 py-4 sm:px-5 sm:py-5 ${index > 0 ? "border-t border-[var(--line)] sm:border-l sm:border-t-0" : ""}`}
              key={label}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--mint)] text-[var(--brand)]">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
                <p className="mt-1 break-words text-sm font-semibold text-[var(--ink)] sm:text-base">
                  {value}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {gstinWarning ? (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {gstinWarning}
        </p>
      ) : null}
      <Card className="max-w-5xl overflow-hidden">
        <CardHeader className="flex flex-row items-center gap-4 border-b border-[var(--line)] px-4 py-5 sm:px-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--mint)] text-[var(--brand)]">
            <FileText aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <CardTitle>Customer information</CardTitle>
            <CardDescription className="mt-1">
              Basic contact and tax details for this customer.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <dl className="grid px-4 sm:grid-cols-2 sm:px-6">
            {rows.map(({ label, value, icon: Icon }, index) => (
              <div
                className={`flex min-w-0 items-center gap-3 py-4 sm:gap-4 sm:px-2 ${index > 0 ? "border-t border-[var(--line)]" : ""} ${index % 2 === 1 ? "sm:border-l sm:pl-5" : "sm:pr-5"} ${index > 1 ? "sm:border-t" : "sm:border-t-0"}`}
                key={label}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--mint)]/70 text-[var(--brand)]">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <dt className="text-sm text-[var(--muted-foreground)]">{label}</dt>
                  <dd className="mt-1 break-words whitespace-pre-line text-sm font-medium text-[var(--ink)] sm:text-base">
                    {value || "—"}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card className="max-w-5xl overflow-hidden">
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
