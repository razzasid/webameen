"use client";

import { ChevronDown, UsersRound } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import type { InvoiceLinkActionState } from "@/server/modules/invoices/actions";
import {
  createInvoiceLinkAction,
  revokeInvoiceLinkAction,
  rotateInvoiceLinkAction,
} from "@/server/modules/invoices/actions";
import type { InvoicePublicLink } from "@/server/modules/invoices/queries";

const emptyState: InvoiceLinkActionState = {};
const buttonClass =
  "rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60";
const secondaryClass =
  "rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold disabled:opacity-60";

function Result({ state }: { state: InvoiceLinkActionState }) {
  return (
    <>
      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="mt-3 text-sm text-green-800">
          {state.message}
        </p>
      ) : null}
      {state.rawToken ? <OneTimeLink token={state.rawToken} /> : null}
    </>
  );
}

function OneTimeLink({ token }: { token: string }) {
  const href = `/i/${token}`;
  const [absoluteUrl, setAbsoluteUrl] = useState(href);
  const [copied, setCopied] = useState(false);
  useEffect(() => setAbsoluteUrl(new URL(href, window.location.origin).toString()), [href]);
  return (
    <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
      <p className="text-sm font-semibold">Copy this customer link now</p>
      <p className="mt-1 text-xs text-green-900">
        It is shown once. Revoke it any time; a customer who already saved a copy will still
        have that copy.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          aria-label="Invoice customer link"
          readOnly
          value={absoluteUrl}
          className="min-w-0 flex-1 rounded-lg border border-green-300 bg-white px-3 py-2 text-xs"
        />
        <button
          type="button"
          className={secondaryClass}
          onClick={() => {
            void navigator.clipboard
              .writeText(new URL(href, window.location.origin).toString())
              .then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function InvoiceSharePanel({
  invoiceId,
  links,
  createRequestKey,
  rotateRequestKey,
  collapsible = false,
}: {
  invoiceId: string;
  links: InvoicePublicLink[];
  createRequestKey: string;
  rotateRequestKey: string;
  collapsible?: boolean;
}) {
  const [createState, createAction, creating] = useActionState(
    createInvoiceLinkAction,
    emptyState,
  );
  const [rotateState, rotateAction, rotating] = useActionState(
    rotateInvoiceLinkAction,
    emptyState,
  );
  const [revokeState, revokeAction, revoking] = useActionState(
    revokeInvoiceLinkAction,
    emptyState,
  );
  const unrevoked = links.find((link) => link.revoked_at === null);
  const now = Date.now();
  const active =
    unrevoked !== undefined &&
    (unrevoked.access_expires_at === null ||
      new Date(unrevoked.access_expires_at).getTime() > now);
  const showCreate = !unrevoked && !createState.rawToken;

  const content = (
    <>
      {!collapsible ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Share a private read-only link. Customers can view this frozen invoice and
          download its PDF without an account.
        </p>
      ) : null}
      {showCreate ? (
        <form action={createAction} className="mt-3">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="requestKey" value={createRequestKey} />
          <button
            type="submit"
            className={`${buttonClass} inline-flex min-h-10 items-center justify-center`}
            disabled={creating}
          >
            {creating ? "Creating link…" : "Create customer link"}
          </button>
        </form>
      ) : null}
      {unrevoked ? (
        <div className="mt-3 flex min-w-0 flex-col gap-3 rounded-xl border border-[#e3ebf7] bg-[#f5f8fd] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-3.5">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-1 size-2.5 shrink-0 rounded-full ${active ? "bg-emerald-600 ring-4 ring-emerald-100" : "bg-amber-500 ring-4 ring-amber-100"}`}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--ink)]">
                {active ? "A customer link is active" : "The customer link has expired"}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Created {new Date(unrevoked.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
            <form action={rotateAction}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <input type="hidden" name="requestKey" value={rotateRequestKey} />
              <button
                type="submit"
                className={`${secondaryClass} inline-flex min-h-10 items-center justify-center whitespace-nowrap px-3 py-2 text-xs`}
                disabled={rotating}
              >
                {rotating ? "Replacing…" : "Create replacement link"}
              </button>
            </form>
            <form action={revokeAction}>
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <input type="hidden" name="linkId" value={unrevoked.id} />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                disabled={revoking}
              >
                {revoking ? "Revoking…" : "Revoke link"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
      <Result state={createState} />
      <Result state={rotateState} />
      <Result state={revokeState} />
      {links.length > 0 ? (
        <details
          id="invoice-link-history"
          className="mt-4 border-t border-[var(--line)] pt-3"
        >
          <summary className="cursor-pointer text-sm font-medium">Link history</summary>
          <ul className="mt-2 space-y-2 text-xs text-[var(--muted-foreground)]">
            {links.map((link) => (
              <li key={link.id}>
                {new Date(link.created_at).toLocaleString()} ·{" "}
                {link.revoked_at
                  ? `revoked (${link.revocation_reason?.replaceAll("_", " ") ?? "unknown"})`
                  : active
                    ? "active"
                    : "expired"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );

  if (collapsible) {
    return (
      <details
        id="customer-access"
        open
        className="group min-w-0 rounded-2xl border border-[#e4ebf8] bg-[#f4f7fc] shadow-[0_1px_2px_rgb(15_45_36/4%)]"
      >
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e4edfc] text-[#315b8a]">
              <UsersRound aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-[var(--ink)]">Customer access</span>
              <span className="mt-1 block text-sm text-[var(--muted-foreground)]">
                Share a private read-only invoice link with your customer.
              </span>
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-5 shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="border-t border-[#e4ebf8] bg-white/70 p-4 sm:p-5">{content}</div>
      </details>
    );
  }

  return (
    <section className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
      <h2 className="text-lg font-semibold">Customer access</h2>
      {content}
    </section>
  );
}
