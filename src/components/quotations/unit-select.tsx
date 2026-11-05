"use client";

import { cn } from "cn";
import { Check, ChevronDown, ChevronUp, Plus, Search, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useMemo, useRef, useState } from "react";

export const COMMON_UNITS = [
  "cm",
  "ft",
  "inch",
  "m",
  "mm",
  "piece",
  "kg",
  "g",
  "litre",
  "ml",
  "meter",
  "sq ft",
  "sq m",
  "box",
  "pack",
  "each",
  "nos",
  "set",
  "roll",
  "bundle",
  "pair",
  "dozen",
  "ton",
  "hour",
  "day",
  "month",
  "service",
] as const;

export type CommonUnit = (typeof COMMON_UNITS)[number];

export function UnitSelect({
  id,
  value,
  onChange,
  "aria-label": ariaLabelProp,
  ariaLabel,
  className,
  placeholder = "Select",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  "aria-label"?: string;
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const label = ariaLabelProp ?? ariaLabel;
  const trimmed = value.trim();
  const isStandard = COMMON_UNITS.includes(trimmed as CommonUnit);

  const allUnits = useMemo(() => {
    if (!isStandard && trimmed) {
      return [trimmed, ...COMMON_UNITS];
    }
    return [...COMMON_UNITS];
  }, [isStandard, trimmed]);

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allUnits;
    return allUnits.filter((u) => u.toLowerCase().includes(q));
  }, [allUnits, search]);

  const isCustomSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q.length > 0 && !allUnits.some((u) => u.toLowerCase() === q);
  }, [allUnits, search]);

  function handleSelect(unit: string) {
    onChange(unit);
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
        <option value="">{placeholder}</option>
        {!isStandard && trimmed ? <option value={trimmed}>{trimmed}</option> : null}
        {COMMON_UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </select>

      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
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
              "flex w-full items-center justify-between gap-1 rounded-md border border-[var(--line)] bg-white px-2.5 text-xs text-left outline-none transition focus:border-[#94a3b8] focus:ring-0",
              className,
            )}
            aria-expanded={open}
          >
            <span
              className={cn("truncate", !value ? "text-[#94a3b8]" : "text-[var(--ink)]")}
            >
              {value || placeholder}
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
            className="z-50 w-(--radix-popover-trigger-width) min-w-[170px] max-w-[260px] rounded-lg border border-[#e2e8f0] bg-white p-2 shadow-lg outline-none"
          >
            {/* Search Input */}
            <div className="relative mb-1.5 flex h-7 items-center rounded-md border border-[#cbd5e1] bg-white px-2 text-xs focus-within:border-[#94a3b8]">
              <Search className="mr-1.5 size-3.5 shrink-0 text-[#94a3b8]" />
              <input
                ref={searchInputRef}
                type="text"
                className="!min-h-0 !h-full w-full !border-0 !border-none bg-transparent p-0 text-xs text-[var(--ink)] !outline-none !ring-0 !shadow-none placeholder:text-[#94a3b8]"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (filteredUnits.length > 0) {
                      handleSelect(filteredUnits[0]);
                    } else if (search.trim()) {
                      handleSelect(search.trim());
                    }
                  }
                }}
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

            {/* Units list */}
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {value ? (
                <button
                  type="button"
                  onClick={() => handleSelect("")}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-xs text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#475569]"
                >
                  <span>— None (clear)</span>
                </button>
              ) : null}
              {filteredUnits.map((unit) => {
                const isSelected = value.toLowerCase() === unit.toLowerCase();
                return (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => handleSelect(unit)}
                    className={cn(
                      "flex w-full items-center justify-between rounded px-2 py-1 text-xs transition-colors",
                      isSelected
                        ? "bg-[#ede9fe] text-[#5b21b6] font-medium"
                        : "text-[#334155] hover:bg-[#f8fafc]",
                    )}
                  >
                    <span>{unit}</span>
                    {isSelected ? <Check className="size-3 text-[#7c3aed]" /> : null}
                  </button>
                );
              })}
              {isCustomSearch ? (
                <button
                  type="button"
                  onClick={() => handleSelect(search.trim())}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-[#0f766e] bg-[#f0fdfa] hover:bg-[#ccfbf1]"
                >
                  <Plus className="size-3" />
                  <span>Use &ldquo;{search.trim()}&rdquo;</span>
                </button>
              ) : null}
              {filteredUnits.length === 0 && !isCustomSearch ? (
                <p className="px-2 py-2 text-center text-xs text-[#94a3b8]">
                  No units found
                </p>
              ) : null}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
