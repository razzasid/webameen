import { PlaceholderPage } from "@/components/pages/placeholder-page";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ logout?: string }>;
}) {
  const { logout } = await searchParams;
  const user = await requireAuthenticatedUser();
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
        <p className="mt-2 text-sm text-[#376a5c]">Signed in as {user.email}</p>
      </div>
      <PlaceholderPage title="Dashboard" />
    </section>
  );
}
