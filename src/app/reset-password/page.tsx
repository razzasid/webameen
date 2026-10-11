import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { updatePasswordAction } from "@/server/modules/identity/actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-svh w-full items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
      <div className="w-full max-w-[460px] min-w-0">
        <Link
          className="mb-5 inline-flex min-h-11 items-center gap-2.5 sm:mb-8 sm:gap-3"
          href="/dashboard"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#14584f] text-lg font-bold text-[#d6f0e5] sm:size-11">
            W
          </span>
          <span className="text-base font-semibold tracking-tight sm:text-lg">
            webameen
          </span>
        </Link>
        <ResetPasswordForm action={updatePasswordAction} invalidLink={error === "link"} />
      </div>
    </main>
  );
}
