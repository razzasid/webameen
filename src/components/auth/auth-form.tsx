"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
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

  return (
    <section className="rounded-[28px] border border-[var(--line)] bg-white p-7 shadow-[0_20px_80px_-48px_rgba(19,55,45,0.32)] md:p-9">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
        Business workspace
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
        {isLogin ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
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
      {state.error ? (
        <p
          className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-800"
          role="alert"
        >
          {state.error}
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

      <form action={formAction} className="mt-7 space-y-4" noValidate>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Email address</span>
          <input
            autoComplete="email"
            className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-[#9aa6a2] focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@business.com"
            value={email}
            type="email"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Password</span>
          <input
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-[#9aa6a2] focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isLogin ? "Enter your password" : "At least 6 characters"}
            value={password}
            type="password"
          />
        </label>
        <button
          className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-wait disabled:opacity-65"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
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
