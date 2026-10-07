"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function CustomerSearch({ initialSearch }: { initialSearch: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialSearch);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setValue(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    const search = value.trim();
    if (search === initialSearch) return;

    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      const query = params.toString();
      router.replace(query ? `/customers?${query}` : "/customers", { scroll: false });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [value, initialSearch, router]);

  return (
    <div className="mt-7 max-w-xl">
      <label htmlFor="customer-search" className="sr-only">
        Search customers
      </label>
      <input
        ref={inputRef}
        id="customer-search"
        name="q"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={100}
        placeholder="Search name, phone, or email"
        className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[#77a99a] focus:ring-4 focus:ring-[#e6f2ed]"
      />
      {value.trim() !== initialSearch ? (
        <p role="status" className="mt-2 text-xs text-[var(--muted)]">
          Updating results…
        </p>
      ) : null}
    </div>
  );
}
