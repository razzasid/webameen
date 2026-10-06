import { getBusinessContext } from "@/server/modules/business/context";
import { gstinStateWarning } from "@/server/modules/business/validation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ logout?: string }>;
}) {
  const { logout } = await searchParams;
  const context = await getBusinessContext();
  if (context.status !== "ready") return null;
  const gstinWarning = context.business.state_code
    ? gstinStateWarning(context.business.gstin, context.business.state_code)
    : null;
  return (
    <section>
      {logout === "failed" ? (
        <p
          className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          We couldn’t sign you out. Please try again.
        </p>
      ) : null}
      <div className="mb-8 rounded-[28px] bg-[#e5f1ed] p-6 md:p-9">
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#183d35]">
          Welcome to Webameen
        </h1>
        <p className="mt-4 text-sm text-[#376a5c]">
          Business: <strong>{context.business.display_name}</strong>
        </p>
        <p className="mt-2 text-sm text-[#376a5c]">Signed in as {context.user.email}</p>
      </div>
      {gstinWarning ? (
        <p
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
        >
          {gstinWarning}
        </p>
      ) : null}
    </section>
  );
}
