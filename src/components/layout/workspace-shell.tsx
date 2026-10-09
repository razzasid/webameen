import { AppSidebar } from "@/components/layout/app-sidebar";
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
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden md:flex-row">
      <AppSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-[var(--line)] bg-white/90 px-5 md:px-9">
          <div className="min-w-0">
            <p className="truncate text-xs text-[var(--muted)]">Workspace</p>
            <p className="truncate text-sm font-semibold">{businessName}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-56 truncate text-sm text-[var(--muted)] sm:block">
              {email}
            </span>
            <form action={logoutAction}>
              <button
                className="rounded-xl border border-[var(--line)] bg-white px-3.5 py-2 text-sm font-medium hover:bg-[var(--paper)]"
                type="submit"
              >
                Log out
              </button>
            </form>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <main className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-9 md:py-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
