"use client";

export function PrintReceiptButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white"
    >
      Print or save receipt
    </button>
  );
}
