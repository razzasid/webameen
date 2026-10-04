const notes: Record<string, string> = {
  Dashboard: "A simple overview of your business documents will live here.",
  Customers: "Your customer directory will live here.",
  "Products & Services": "Your reusable products and services will live here.",
  Quotations: "Your quotation workspace will live here.",
  Invoices: "Your invoice workspace will live here.",
  Payments: "Your payment records will live here.",
  Settings: "Your business preferences will live here.",
};

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
            Webameen workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-[38px]">
            {title}
          </h1>
        </div>
        <span className="rounded-full border border-[#dbe7e1] bg-white px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
          Foundation placeholder
        </span>
      </div>

      {title === "Dashboard" ? (
        <div className="mt-8 overflow-hidden rounded-[28px] bg-[#e5f1ed] p-6 md:p-9">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-[#376a5c]">Welcome to Webameen</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#183d35] md:text-3xl">
              Your business workspace starts here.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#527168]">
              This foundation is ready for the product workflow. For now, use the navigation
              to explore each placeholder screen.
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["01", "Customers", "A place for customer records"],
              ["02", "Documents", "A place for quotes and invoices"],
              ["03", "Payments", "A place for payment history"],
            ].map(([number, label, description]) => (
              <div
                className="rounded-2xl border border-[#cfe1d9] bg-white/70 p-4"
                key={number}
              >
                <span className="text-xs font-semibold text-[#438070]">{number}</span>
                <p className="mt-3 text-sm font-semibold text-[#1b3933]">{label}</p>
                <p className="mt-1 text-xs leading-5 text-[#688078]">{description}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-8 rounded-[28px] border border-[var(--line)] bg-white p-6 shadow-[0_12px_40px_-32px_rgba(25,52,45,0.3)] md:p-9">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-[var(--mint)] text-xl text-[var(--brand)]">
            ◇
          </div>
          <h2 className="mt-5 text-lg font-semibold">Ready for the next milestone</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
            {notes[title] ?? "This area is reserved for the next milestone."} No business
            data or actions are connected on this screen yet.
          </p>
        </div>
      )}
    </section>
  );
}
