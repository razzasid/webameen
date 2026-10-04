import Link from "next/link";
import { AppSidebar } from "@/components/layout/app-sidebar";

export function WorkspaceShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen md:flex">
      <AppSidebar />
      <div className="min-w-0 flex-1">
        <header className="flex h-[68px] items-center justify-between border-b border-[var(--line)] bg-white/90 px-5 md:px-9">
          <div className="min-w-0">
            <p className="truncate text-xs text-[var(--muted)]">Workspace</p>
            <p className="truncate text-sm font-semibold">Your business</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="rounded-xl px-3 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
              href="/login"
            >
              Log in
            </Link>
            <Link
              className="rounded-xl bg-[var(--brand)] px-3.5 py-2 text-sm !text-white hover:bg-[var(--brand-dark)]"
              href="/signup"
            >
              Sign up
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-9 md:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
