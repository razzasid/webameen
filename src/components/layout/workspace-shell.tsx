import { Plus } from "lucide-react";
import Link from "next/link";
import { AccountMenu } from "@/components/layout/account-menu";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/modules/identity/actions";

export function WorkspaceShell({
  children,
  email,
  businessName,
}: Readonly<{
  children: React.ReactNode;
  email: string;
  businessName: string;
}>) {
  const logoutForm = (
    <form action={logoutAction}>
      <button
        className="flex min-h-11 w-full items-center justify-center rounded-lg border border-white/25 px-4 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b3e3d0]"
        type="submit"
      >
        Log out
      </button>
    </form>
  );

  return (
    <div className="flex h-dvh min-h-[100svh] min-w-0 flex-col overflow-hidden bg-[var(--paper)] md:flex-row">
      <a
        className="sr-only z-50 rounded-md bg-white p-3 text-[var(--brand-dark)] focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
        href="#workspace-main"
      >
        Skip to main content
      </a>
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-white px-4 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#dff2e9] text-base font-bold text-[#104e42] md:hidden"
            >
              W
            </span>
            <div className="min-w-0">
              <p className="hidden text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-foreground)] sm:block">
                Workspace
              </p>
              <p className="truncate text-sm font-semibold text-[var(--ink)] sm:mt-0.5">
                {businessName}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Button asChild className="gap-1.5 px-3 sm:px-4" size="sm">
              <Link href="/quotations/new">
                <Plus aria-hidden="true" />
                <span className="sm:hidden">Quote</span>
                <span className="hidden sm:inline">New quotation</span>
              </Link>
            </Button>
            <AccountMenu email={email} />
          </div>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <main
            className="mx-auto w-full max-w-[1380px] min-w-0 px-4 py-6 pb-24 sm:px-5 sm:py-7 md:px-7 md:py-8 md:pb-8 lg:px-9"
            id="workspace-main"
            tabIndex={-1}
          >
            {children}
          </main>
        </div>
      </div>
      <MobileNavigation businessName={businessName} email={email} logoutForm={logoutForm} />
    </div>
  );
}
