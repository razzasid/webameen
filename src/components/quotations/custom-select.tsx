"use client";

import { cn } from "cn";
import { Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useMemo, useRef, useState } from "react";

export type SelectOption = {
  value: string;
  label: string;
};

export function CustomSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select",
  className,
  "aria-label": ariaLabelProp,
  ariaLabel,
  withSearch = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  ariaLabel?: string;
  withSearch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const label = ariaLabelProp ?? ariaLabel;

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    if (!withSearch || !search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, search, withSearch]);

  function handleSelect(val: string) {
    onChange(val);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="relative w-full">
      {/* Hidden accessible select for forms and Playwright tests */}
      <select
        id={id}
        aria-label={label}
        className="sr-only pointer-events-none"
        tabIndex={-1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next && withSearch) {
            setSearch("");
            setTimeout(() => {
              searchInputRef.current?.focus();
            }, 0);
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-1 rounded-md border border-[var(--line)] bg-white px-2.5 py-1 text-xs text-left outline-none transition focus:border-[#94a3b8] focus:ring-0",
              className,
            )}
            aria-expanded={open}
          >
            <span
              className={cn(
                "truncate",
                !selectedOption || selectedOption.value === ""
                  ? "text-[#94a3b8]"
                  : "text-[var(--ink)]",
              )}
            >
              {selectedOption && selectedOption.value !== ""
                ? selectedOption.label
                : placeholder}
            </span>
            {open ? (
              <ChevronUp className="size-3.5 shrink-0 text-[#64748b]" />
            ) : (
              <ChevronDown className="size-3.5 shrink-0 text-[#64748b]" />
            )}
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-50 w-(--radix-popover-trigger-width) min-w-[130px] max-w-[240px] rounded-lg border border-[#e2e8f0] bg-white p-1.5 shadow-lg outline-none"
          >
            {withSearch ? (
              <div className="relative mb-1.5 flex h-7 items-center rounded-md border border-[#cbd5e1] bg-white px-2 text-xs focus-within:border-[#94a3b8]">
                <Search className="mr-1.5 size-3.5 shrink-0 text-[#94a3b8]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="!min-h-0 !h-full w-full !border-0 !border-none bg-transparent p-0 text-xs text-[var(--ink)] !outline-none !ring-0 !shadow-none placeholder:text-[#94a3b8]"
                  placeholder="Search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="text-[#94a3b8] hover:text-[#475569]"
                    aria-label="Clear search"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filteredOptions.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "flex w-full items-center justify-between rounded px-2 py-1.5 text-xs transition-colors",
                      isSelected
                        ? "bg-[#ede9fe] text-[#5b21b6] font-medium"
                        : "text-[#334155] hover:bg-[#f8fafc]",
                    )}
                  >
                    <span>{opt.label}</span>
                    {isSelected ? <Check className="size-3 text-[#7c3aed]" /> : null}
                  </button>
                );
              })}
              {filteredOptions.length === 0 ? (
                <p className="px-2 py-2 text-center text-xs text-[#94a3b8]">No options</p>
              ) : null}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
