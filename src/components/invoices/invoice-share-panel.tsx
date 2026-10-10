"use client";

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
}: {
  invoiceId: string;
  links: InvoicePublicLink[];
  createRequestKey: string;
  rotateRequestKey: string;
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

  return (
    <section className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
      <h2 className="text-lg font-semibold">Customer access</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Share a private read-only link. Customers can view this frozen invoice and download
        its PDF without an account.
      </p>
      {showCreate ? (
        <form action={createAction} className="mt-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="requestKey" value={createRequestKey} />
          <button type="submit" className={buttonClass} disabled={creating}>
            {creating ? "Creating link…" : "Create customer link"}
          </button>
        </form>
      ) : null}
      {unrevoked ? (
        <div className="mt-4 rounded-xl bg-[var(--canvas)] p-4">
          <p className="text-sm font-medium">
            {active ? "A customer link is active" : "The customer link has expired"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Created {new Date(unrevoked.created_at).toLocaleString()}
          </p>
          <form action={rotateAction} className="mt-3">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="requestKey" value={rotateRequestKey} />
            <button type="submit" className={secondaryClass} disabled={rotating}>
              {rotating ? "Replacing…" : "Create replacement link"}
            </button>
          </form>
          <form action={revokeAction} className="mt-3">
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <input type="hidden" name="linkId" value={unrevoked.id} />
            <button
              type="submit"
              className="text-sm font-semibold text-red-700"
              disabled={revoking}
            >
              {revoking ? "Revoking…" : "Revoke link"}
            </button>
          </form>
        </div>
      ) : null}
      <Result state={createState} />
      <Result state={rotateState} />
      <Result state={revokeState} />
      {links.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">Link history</summary>
          <ul className="mt-2 space-y-2 text-xs text-[var(--muted)]">
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
    </section>
  );
}
