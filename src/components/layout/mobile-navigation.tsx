"use client";

import { type LucideIcon, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { workspaceNavigation } from "@/components/layout/app-sidebar";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const primaryItems = workspaceNavigation.filter((item) =>
  ["/dashboard", "/customers", "/quotations", "/invoices"].includes(item.href),
);
const moreItems = workspaceNavigation.filter((item) =>
  ["/catalog", "/payments", "/settings"].includes(item.href),
);

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLink({
  href,
  label,
  icon: Icon,
  active,
  closeOnSelect = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  closeOnSelect?: boolean;
}) {
  const link = (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b3e3d0]",
        active
          ? "bg-[#dff2e9] text-[#123c34]"
          : "text-white/85 hover:bg-white/10 hover:text-white",
      )}
      href={href}
    >
      <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.8} />
      <span>{label}</span>
    </Link>
  );
  return closeOnSelect ? <SheetClose asChild>{link}</SheetClose> : link;
}

export function MobileNavigation({
  businessName,
  email,
  logoutForm,
}: {
  businessName: string;
  email: string;
  logoutForm: ReactNode;
}) {
  const pathname = usePathname();
  const moreIsActive = moreItems.some((item) => isActive(pathname, item.href));

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_-22px_rgba(14,48,39,0.45)] backdrop-blur md:hidden"
    >
      <div className="mx-auto grid h-[64px] max-w-xl grid-cols-5 px-1">
        {primaryItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                active ? "text-[var(--brand-dark)]" : "text-[var(--muted-foreground)]",
              )}
              href={href}
              key={href}
            >
              <Icon
                aria-hidden="true"
                className="size-[18px]"
                strokeWidth={active ? 2.4 : 1.8}
              />
              <span className="max-w-full truncate">{label}</span>
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 h-0.5 w-5 rounded-full bg-[var(--brand)]"
                />
              ) : null}
            </Link>
          );
        })}
        <Sheet>
          <SheetTrigger asChild>
            <button
              aria-label="More navigation options"
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                moreIsActive
                  ? "text-[var(--brand-dark)]"
                  : "text-[var(--muted-foreground)]",
              )}
              type="button"
            >
              <MoreHorizontal aria-hidden="true" className="size-[18px]" />
              <span>More</span>
            </button>
          </SheetTrigger>
          <SheetContent
            className="w-[min(20rem,86vw)] border-r border-white/10 bg-[#102c27] p-0 text-white"
            side="left"
            showCloseButton
          >
            <SheetHeader className="border-b border-white/10 px-5 py-5 pr-14 text-left">
              <SheetTitle className="flex items-center gap-3 text-white">
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#d8f0e5] text-lg font-bold text-[#104e42]">
                  W
                </span>
                <span>Webameen</span>
              </SheetTitle>
              <SheetDescription className="break-words text-white/70">
                {businessName} · {email || "Business workspace"}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-1 px-3 py-4">
              {workspaceNavigation.slice(0, 1).map(({ href, label, icon }) => (
                <NavigationLink
                  active={isActive(pathname, href)}
                  closeOnSelect
                  href={href}
                  icon={icon}
                  key={href}
                  label={label}
                />
              ))}
              <div className="my-3 border-t border-white/10" />
              {moreItems.map(({ href, label, icon }) => (
                <NavigationLink
                  active={isActive(pathname, href)}
                  closeOnSelect
                  href={href}
                  icon={icon}
                  key={href}
                  label={label}
                />
              ))}
              {primaryItems.slice(1).map(({ href, label, icon }) => (
                <NavigationLink
                  active={isActive(pathname, href)}
                  closeOnSelect
                  href={href}
                  icon={icon}
                  key={href}
                  label={label}
                />
              ))}
            </div>
            <div className="mt-auto border-t border-white/10 px-4 py-4">{logoutForm}</div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
