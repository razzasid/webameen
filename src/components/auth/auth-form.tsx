"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import type { AuthActionState } from "@/server/modules/identity/credentials";

type AuthFormProps = {
  action: (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
  initialNotice?: string;
  mode: "login" | "signup";
};

const initialState: AuthActionState = {};

export function AuthForm({ action, initialNotice, mode }: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isLogin = mode === "login";
  const { dismissField, fieldError, generalError } = useFieldErrors<"email" | "password">(
    state,
  );
  const emailError = fieldError("email");
  const passwordError = fieldError("password");

  return (
    <section className="min-w-0 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-[0_16px_48px_-40px_rgba(19,55,45,0.32)] sm:rounded-[28px] sm:p-7 sm:shadow-[0_20px_80px_-48px_rgba(19,55,45,0.32)] md:p-9">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
        Business workspace
      </p>
      <h1 className="mt-2 text-[1.75rem] leading-tight font-semibold tracking-[-0.04em] sm:text-3xl">
        {isLogin ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
        {isLogin
          ? "Sign in to continue to your workspace."
          : "Create a Webameen account to get started."}
      </p>

      {initialNotice ? (
        <p
          className="mt-5 rounded-xl border border-[#cce9df] bg-[#f2faf6] px-3.5 py-3 text-sm leading-5 text-[#14584f]"
          role="status"
        >
          {initialNotice}
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
      {state.notice ? (
        <p
          className="mt-5 rounded-xl border border-[#cce9df] bg-[#f2faf6] px-3.5 py-3 text-sm leading-5 text-[#14584f]"
          role="status"
        >
          {state.notice}
        </p>
      ) : null}

      <form action={formAction} className="mt-6 space-y-4 sm:mt-7" noValidate>
        <div>
          <label className="block" htmlFor="auth-email">
            <span className="mb-1.5 block text-sm font-medium">Email address</span>
          </label>
          <input
            aria-describedby={emailError ? "auth-email-error" : undefined}
            aria-invalid={Boolean(emailError)}
            autoComplete="email"
            className="w-full min-w-0 rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base outline-none transition placeholder:text-[#9aa6a2] focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed] sm:px-3.5 sm:text-sm"
            id="auth-email"
            name="email"
            onChange={(event) => {
              setEmail(event.target.value);
              dismissField("email");
            }}
            placeholder="you@business.com"
            value={email}
            type="email"
          />
          {emailError ? (
            <p className="mt-1.5 text-sm text-red-700" id="auth-email-error" role="alert">
              {emailError}
            </p>
          ) : null}
        </div>
        <div>
          <label className="block" htmlFor="auth-password">
            <span className="mb-1.5 block text-sm font-medium">Password</span>
          </label>
          <input
            aria-describedby={passwordError ? "auth-password-error" : undefined}
            aria-invalid={Boolean(passwordError)}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="w-full min-w-0 rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-base outline-none transition placeholder:text-[#9aa6a2] focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed] sm:px-3.5 sm:text-sm"
            id="auth-password"
            name="password"
            onChange={(event) => {
              setPassword(event.target.value);
              dismissField("password");
            }}
            placeholder={isLogin ? "Enter your password" : "At least 6 characters"}
            value={password}
            type="password"
          />
          {passwordError ? (
            <p
              className="mt-1.5 text-sm text-red-700"
              id="auth-password-error"
              role="alert"
            >
              {passwordError}
            </p>
          ) : null}
        </div>
        <button
          className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-wait disabled:opacity-65"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>

      {isLogin ? (
        <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          <Link
            className="font-medium text-[var(--brand)] hover:text-[var(--brand-dark)]"
            href="/forgot-password"
          >
            Forgot password?
          </Link>
          <Link
            className="font-medium text-[var(--brand)] hover:text-[var(--brand-dark)]"
            href="/resend-confirmation"
          >
            Resend confirmation
          </Link>
        </div>
      ) : null}

      <p className="mt-5 text-center text-sm text-[var(--muted-foreground)] sm:mt-6">
        {isLogin ? "New to Webameen?" : "Already have an account?"}{" "}
        <Link
          className="font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)]"
          href={isLogin ? "/signup" : "/login"}
        >
          {isLogin ? "Sign up" : "Log in"}
        </Link>
      </p>
    </section>
  );
}
