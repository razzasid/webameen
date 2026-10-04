import Link from "next/link";

type AuthPlaceholderProps = {
  mode: "login" | "signup";
};

export function AuthPlaceholder({ mode }: AuthPlaceholderProps) {
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
          : "Set up a Webameen account for your business."}
      </p>

      <form className="mt-7 space-y-4">
        {!isLogin ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Your name</span>
            <input
              autoComplete="name"
              className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-[#9aa6a2] focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]"
              placeholder="Name"
              type="text"
            />
          </label>
        ) : null}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Email address</span>
          <input
            autoComplete="email"
            className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-[#9aa6a2] focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]"
            placeholder="you@business.com"
            type="email"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Password</span>
          <input
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-[#9aa6a2] focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]"
            placeholder="Enter your password"
            type="password"
          />
        </label>
        <button
          className="w-full cursor-not-allowed rounded-xl bg-[#a5bbb4] px-4 py-3 text-sm font-semibold text-white"
          disabled
          type="button"
        >
          {isLogin ? "Sign in (not connected)" : "Sign up (not connected)"}
        </button>
      </form>

      <p className="mt-5 rounded-xl bg-[#f5f8f6] px-3.5 py-3 text-xs leading-5 text-[var(--muted)]">
        Authentication is not connected in this foundation milestone. These screens are
        layout placeholders.
      </p>

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
