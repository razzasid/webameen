import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { getBusinessContext } from "@/server/modules/business/context";
import { logoutAction } from "@/server/modules/identity/actions";

export default async function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getBusinessContext();
  if (context.status === "needs_setup") redirect("/onboarding/business");
  if (context.status === "disabled") {
    return (
      <main className="mx-auto max-w-xl px-5 py-16">
        <h1 className="text-2xl font-semibold">Business access unavailable</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          This account already has a business membership, but its access is disabled.
          Contact the workspace operator.
        </p>
        <form action={logoutAction} className="mt-5">
          <button
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Log out
          </button>
        </form>
      </main>
    );
  }
  return (
    <WorkspaceShell
      email={context.user.email ?? ""}
      businessName={context.business.display_name}
    >
      {children}
    </WorkspaceShell>
  );
}
