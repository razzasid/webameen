import { ArrowDownRight, ArrowUpRight, FileText, Plus, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getBusinessContext } from "@/server/modules/business/context";
import { gstinStateWarning } from "@/server/modules/business/validation";
import { formatPaise } from "@/server/modules/catalog/validation";
import { getDashboardOverview } from "@/server/modules/dashboard/queries";

function formatActivityDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ logout?: string }>;
}) {
  const { logout } = await searchParams;
  const [context, dashboard] = await Promise.all([
    getBusinessContext(),
    getDashboardOverview(),
  ]);
  if (context.status !== "ready" || !dashboard) return null;

  const gstinWarning = context.business.state_code
    ? gstinStateWarning(context.business.gstin, context.business.state_code)
    : null;
  const metrics = [
    {
      label: "Customers",
      value: dashboard.overview.customerCount.toLocaleString("en-IN"),
      detail: "Active business contacts",
      icon: Users,
      tone: "text-[var(--brand-dark)] bg-[var(--mint)]",
    },
    {
      label: "Quotations awaiting response",
      value: dashboard.overview.awaitingResponseCount.toLocaleString("en-IN"),
      detail: `${dashboard.overview.quotationCount.toLocaleString("en-IN")} quotations total`,
      icon: FileText,
      tone: "text-[var(--info)] bg-blue-50",
    },
    {
      label: "Invoices issued",
      value: dashboard.overview.invoiceCount.toLocaleString("en-IN"),
      detail: `${dashboard.overview.paidInvoiceCount.toLocaleString("en-IN")} paid · ${dashboard.overview.overdueInvoiceCount.toLocaleString("en-IN")} overdue`,
      icon: FileText,
      tone: "text-[var(--success)] bg-emerald-50",
    },
    {
      label: "Outstanding",
      value: formatPaise(dashboard.overview.outstandingMinor),
      detail: `${dashboard.overview.outstandingInvoiceCount.toLocaleString("en-IN")} invoices with a balance`,
      icon: Wallet,
      tone: "text-[var(--warning)] bg-amber-50",
    },
  ];

  return (
    <section className="space-y-6 sm:space-y-7">
      {logout === "failed" ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>We couldn’t sign you out. Please try again.</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--brand)]">Business overview</p>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">
            {dashboard.businessName}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
            Recent work and balances from your business records.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button asChild className="flex-1 sm:flex-none" variant="outline">
            <Link href="/customers/new">
              <Users aria-hidden="true" /> Add customer
            </Link>
          </Button>
          <Button asChild className="flex-1 sm:flex-none">
            <Link href="/quotations/new">
              <Plus aria-hidden="true" /> New quotation
            </Link>
          </Button>
        </div>
      </div>

      {gstinWarning ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950" role="status">
          <AlertDescription>{gstinWarning}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon, tone }) => (
          <Card className="min-w-0" key={label}>
            <CardHeader className="flex grid-cols-[auto_1fr] items-start gap-3 space-y-0 px-4 pb-1 pt-4 sm:px-5 sm:pt-5">
              <span
                className={`flex size-10 items-center justify-center rounded-lg ${tone}`}
              >
                <Icon aria-hidden="true" className="size-[19px]" strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <CardDescription className="leading-5">{label}</CardDescription>
                <CardTitle className="mt-1 break-words font-mono text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
                  {value}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pl-[4.25rem] pr-4 pb-4 text-xs text-[var(--muted-foreground)] sm:pl-[4.5rem] sm:px-5 sm:pb-5">
              {detail}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.85fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-5">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription className="mt-1">
                Latest changes across customers and documents.
              </CardDescription>
            </div>
            <span className="sr-only">Latest first</span>
          </CardHeader>
          <CardContent className="p-0">
            {dashboard.overview.recentActivity.length ? (
              <ul className="divide-y divide-[var(--line)]">
                {dashboard.overview.recentActivity.map((activity) => (
                  <li key={activity.id}>
                    <Link
                      className="flex min-h-16 min-w-0 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] sm:px-5"
                      href={activity.href}
                    >
                      <span className="min-w-0">
                        <strong className="block truncate text-sm font-medium text-[var(--ink)]">
                          {activity.title}
                        </strong>
                        <span className="mt-1 block break-words text-xs text-[var(--muted-foreground)]">
                          {activity.detail}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        {activity.amountMinor ? (
                          <span className="block font-mono text-sm font-semibold tabular-nums">
                            {formatPaise(activity.amountMinor)}
                          </span>
                        ) : null}
                        <time
                          className="mt-1 block text-[11px] text-[var(--muted-foreground)]"
                          dateTime={activity.occurredAt}
                        >
                          {formatActivityDate(activity.occurredAt, dashboard.timeZone)}
                        </time>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium">Your activity will appear here</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  Add a customer or create a quotation to begin.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
            <CardTitle>Quick actions</CardTitle>
            <CardDescription className="mt-1">
              Pick up your next business task.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-1 sm:p-5">
            <Button asChild className="justify-start" variant="outline">
              <Link href="/quotations">
                <FileText aria-hidden="true" /> Review quotations
                <ArrowUpRight aria-hidden="true" className="ml-auto" />
              </Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/invoices">
                <Wallet aria-hidden="true" /> Review invoices
                <ArrowDownRight aria-hidden="true" className="ml-auto" />
              </Link>
            </Button>
            <Button asChild className="justify-start" variant="outline">
              <Link href="/catalog">
                <Plus aria-hidden="true" /> Update products &amp; services
                <ArrowUpRight aria-hidden="true" className="ml-auto" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
