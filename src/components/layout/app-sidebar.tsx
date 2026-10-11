"use client";

import {
  CreditCard,
  FileText,
  Gauge,
  type LucideIcon,
  Package,
  ReceiptText,
  Settings2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const workspaceNavigation: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
}> = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/catalog", label: "Products & services", icon: Package },
  { href: "/quotations", label: "Quotations", icon: FileText },
  { href: "/invoices", label: "Invoices", icon: ReceiptText },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-dvh w-[168px] shrink-0 flex-col border-r border-white/10 bg-[#082c26] text-white md:flex xl:w-60">
      <Link
        aria-label="Webameen dashboard"
        className="flex h-16 items-center justify-start gap-2.5 border-b border-white/10 px-3 xl:gap-3 xl:px-5"
        href="/dashboard"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#d8f0e5] text-lg font-bold text-[#104e42]">
          W
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold tracking-tight xl:text-[16px]">
            webameen
          </span>
          <span className="mt-0.5 block text-[10px] uppercase tracking-[0.14em] text-white/65">
            Business workspace
          </span>
        </span>
      </Link>

      <nav aria-label="Main navigation" className="space-y-1 px-2 py-5 xl:px-3">
        {workspaceNavigation.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              aria-label={label}
              className={cn(
                "group flex min-h-11 items-center justify-start gap-2.5 rounded-lg px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b3e3d0] xl:gap-3 xl:px-3 xl:text-sm",
                active
                  ? "border-l-[3px] border-l-[#8ce0c5] bg-[#075b4e] !text-white"
                  : "text-white/78 hover:bg-white/10 hover:text-white",
              )}
              href={href}
              key={href}
              title={label}
            >
              <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.8} />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden px-2 pb-5 md:block xl:px-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-2.5 xl:p-3.5">
          <p className="text-xs font-semibold text-white">Your business workspace</p>
          <p className="mt-1 text-xs leading-5 text-white/65">
            Keep customers and business documents together.
          </p>
        </div>
      </div>
    </aside>
  );
}
