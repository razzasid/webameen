"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import type { AuthActionState } from "@/server/modules/identity/credentials";

type ResetPasswordFormProps = {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  invalidLink: boolean;
};

export function ResetPasswordForm({ action, invalidLink }: ResetPasswordFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [password, setPassword] = useState("");
  const { dismissField, fieldError, generalError } = useFieldErrors<"password">(state);
  const passwordError = fieldError("password");

  return (
    <section className="min-w-0 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_16px_48px_-40px_rgba(19,55,45,0.32)] sm:rounded-[28px] sm:p-7 sm:shadow-[0_20px_80px_-48px_rgba(19,55,45,0.32)] md:p-9">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
        Business workspace
      </p>
      <h1 className="mt-2 text-[1.75rem] leading-tight font-semibold tracking-[-0.04em] sm:text-3xl">
        Choose a new password
      </h1>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
        Enter a new password with at least 6 characters.
      </p>

      {invalidLink ? (
        <p
          className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-5 text-amber-900"
          role="alert"
        >
          This password reset link is invalid or expired. Request a new link to continue.
        </p>
      ) : null}
      {generalError ? (
        <p
          className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-800"
          role="alert"
        >
          {generalError}
        </p>
      ) : null}

      <form action={formAction} className="mt-6 space-y-4 sm:mt-7" noValidate>
        <div>
          <label className="block" htmlFor="new-password">
            <span className="mb-1.5 block text-sm font-medium">New password</span>
          </label>
          <input
            aria-describedby={passwordError ? "new-password-error" : undefined}
            aria-invalid={Boolean(passwordError)}
            autoComplete="new-password"
            className="w-full min-w-0 rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base outline-none transition placeholder:text-[#9aa6a2] focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed] sm:px-3.5 sm:text-sm"
            id="new-password"
            name="password"
            onChange={(event) => {
              setPassword(event.target.value);
              dismissField("password");
            }}
            placeholder="At least 6 characters"
            value={password}
            type="password"
          />
          {passwordError ? (
            <p className="mt-1.5 text-sm text-red-700" id="new-password-error" role="alert">
              {passwordError}
            </p>
          ) : null}
        </div>
        <button
          className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-wait disabled:opacity-65"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Updating…" : "Update password"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-[var(--muted-foreground)] sm:mt-6">
        <Link
          className="font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)]"
          href="/forgot-password"
        >
          Request another reset link
        </Link>
      </p>
    </section>
  );
}
