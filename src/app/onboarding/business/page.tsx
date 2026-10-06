import { redirect } from "next/navigation";
import { BusinessSetupForm } from "@/components/business/business-setup-form";
import { createBusinessAction } from "@/server/modules/business/actions";
import { getBusinessContext } from "@/server/modules/business/context";
import { logoutAction } from "@/server/modules/identity/actions";

export default async function BusinessOnboardingPage() {
  const context = await getBusinessContext();
  if (context.status !== "needs_setup") redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-5 py-12">
      <section className="w-full rounded-[28px] border border-[var(--line)] bg-white p-7 shadow-[0_20px_80px_-48px_rgba(19,55,45,0.32)] md:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
          Webameen setup
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
          Set up your business
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Add the business details you want to use in your workspace.
        </p>
        <BusinessSetupForm action={createBusinessAction} />
        <form action={logoutAction} className="mt-5 text-center">
          <button className="text-sm text-[var(--muted)] underline" type="submit">
            Log out
          </button>
        </form>
      </section>
    </main>
  );
}
