"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂" },
  { href: "/customers", label: "Customers", icon: "◎" },
  { href: "/products", label: "Products & services", icon: "◇" },
  { href: "/quotations", label: "Quotations", icon: "▤" },
  { href: "/invoices", label: "Invoices", icon: "▧" },
  { href: "/payments", label: "Payments", icon: "↗" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-full flex-col border-b border-white/10 bg-[#122b28] text-white md:min-h-screen md:w-[252px] md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-5 py-5 md:px-6 md:py-7">
        <Link
          aria-label="Webameen home"
          className="flex items-center gap-3"
          href="/dashboard"
        >
          <span className="flex size-10 items-center justify-center rounded-2xl bg-[#cce9df] text-lg font-bold text-[#14564d]">
            W
          </span>
          <span>
            <span className="block text-[17px] font-semibold tracking-tight">webameen</span>
            <span className="block text-[10px] uppercase tracking-[0.16em] text-white/55">
              Business workspace
            </span>
          </span>
        </Link>
        <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/70 md:hidden">
          Prototype
        </span>
      </div>

      <div className="hidden px-6 pb-4 md:block">
        <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">
          Prototype shell
        </span>
      </div>

      <nav
        aria-label="Main navigation"
        className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:px-3 md:py-2"
      >
        {navigation.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={
                "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition " +
                (active
                  ? "bg-white !text-[#173a35] shadow-sm"
                  : "text-white/70 hover:bg-white/8 hover:text-white")
              }
              href={item.href}
              key={item.href}
            >
              <span aria-hidden="true" className="w-5 text-center text-base leading-none">
                {item.icon}
              </span>
              <span className="whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden px-5 pb-6 pt-4 md:block">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-medium text-white/90">Foundation stage</p>
          <p className="mt-1.5 text-xs leading-5 text-white/55">
            Navigation is ready. Business workflows will be added after this milestone.
          </p>
        </div>
      </div>
    </aside>
  );
}
