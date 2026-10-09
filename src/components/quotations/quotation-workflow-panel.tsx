"use client";

import { useActionState, useEffect, useState } from "react";
import type { QuotationWorkflowActionState } from "@/server/modules/quotations/actions";
import {
  createQuotationRevisionAction,
  revokeQuotationLinkAction,
  rotateQuotationLinkAction,
  shareQuotationAction,
} from "@/server/modules/quotations/actions";
import type { QuotationWorkflow } from "@/server/modules/quotations/queries";

const initialState: QuotationWorkflowActionState = {};
const buttonClass =
  "rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60";
const secondaryClass =
  "rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold disabled:opacity-60";

function Result({ state }: { state: QuotationWorkflowActionState }) {
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
      {state.rawToken ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold">Copy this customer link now</p>
          <p className="mt-1 text-xs text-green-900">
            It is shown once. If it is lost, create a replacement link.
          </p>
          <ShareLink token={state.rawToken} />
        </div>
      ) : null}
    </>
  );
}

function ShareLink({ token }: { token: string }) {
  const url = `/q/${token}`;
  const [shareUrl, setShareUrl] = useState(url);
  useEffect(() => setShareUrl(new URL(url, window.location.origin).toString()), [url]);
  return (
    <div className="mt-3 flex gap-2">
      <input
        aria-label="Quotation link"
        readOnly
        value={shareUrl}
        className="min-w-0 flex-1 rounded-lg border border-green-300 bg-white px-3 py-2 text-xs"
      />
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard.writeText(
            new URL(url, window.location.origin).toString(),
          )
        }
        className={secondaryClass}
      >
        Copy
      </button>
    </div>
  );
}

export function QuotationWorkflowPanel({
  workflow,
  shareRequestKey,
  rotateRequestKey,
}: {
  workflow: QuotationWorkflow;
  shareRequestKey: string;
  rotateRequestKey: string;
}) {
  const [shareState, shareAction, sharing] = useActionState(
    shareQuotationAction,
    initialState,
  );
  const [rotateState, rotateAction, rotating] = useActionState(
    rotateQuotationLinkAction,
    initialState,
  );
  const [revokeState, revokeAction, revoking] = useActionState(
    revokeQuotationLinkAction,
    initialState,
  );
  const [revisionState, revisionAction, revising] = useActionState(
    createQuotationRevisionAction,
    initialState,
  );
  const current = workflow.versions.find(
    (version) => version.id === workflow.current_version_id,
  );
  if (!current) return null;
  const canShare = current.state === "draft" && !shareState.rawToken;
  const canRevise = current.shared_at !== null && current.state !== "superseded";
  const canRotate = canRevise && !rotateState.rawToken;

  return (
    <section className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
      <h2 className="text-lg font-semibold">Sharing and customer response</h2>
      {canShare ? (
        <form action={shareAction} className="mt-4">
          <input type="hidden" name="quotationId" value={workflow.quotation_id} />
          <input type="hidden" name="versionId" value={current.id} />
          <input type="hidden" name="requestKey" value={shareRequestKey} />
          <p className="text-sm text-[var(--muted)]">
            Sharing freezes this draft and creates a private link for the customer.
          </p>
          <button type="submit" className={`${buttonClass} mt-3`} disabled={sharing}>
            {sharing ? "Sharing…" : "Share quotation"}
          </button>
        </form>
      ) : null}
      <Result state={shareState} />
      {canRevise ? (
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-t border-[var(--line)] pt-4">
          <div>
            <p className="text-sm font-medium">
              Version {current.version_number} is frozen.
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Create a revision to make changes. The earlier version stays available while
              the revision is a draft.
            </p>
          </div>
          <form action={revisionAction}>
            <input type="hidden" name="quotationId" value={workflow.quotation_id} />
            <input type="hidden" name="versionId" value={current.id} />
            <button type="submit" className={secondaryClass} disabled={revising}>
              {revising ? "Creating…" : "Create revision"}
            </button>
            <Result state={revisionState} />
          </form>
        </div>
      ) : null}
      {canRotate ? (
        <form action={rotateAction} className="mt-4 border-t border-[var(--line)] pt-4">
          <input type="hidden" name="quotationId" value={workflow.quotation_id} />
          <input type="hidden" name="versionId" value={current.id} />
          <input type="hidden" name="requestKey" value={rotateRequestKey} />
          <p className="text-sm text-[var(--muted)]">
            Lost or expired link? Create a replacement for this frozen version. The old link
            will stop working.
          </p>
          <button type="submit" className={`${secondaryClass} mt-3`} disabled={rotating}>
            {rotating ? "Rotating…" : "Create replacement link"}
          </button>
        </form>
      ) : null}
      <Result state={rotateState} />
      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <h3 className="font-medium">Version history</h3>
        <ul className="mt-3 space-y-3">
          {workflow.versions.map((version) => (
            <li key={version.id} className="rounded-xl bg-[var(--canvas)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  Version {version.version_number} ·{" "}
                  <span className="capitalize">{version.state.replaceAll("_", " ")}</span>
                </span>
                <span>
                  {version.response
                    ? `Customer ${version.response.kind.replaceAll("_", " ")}`
                    : version.shared_at
                      ? "Shared"
                      : "Draft"}
                </span>
              </div>
              {version.response?.customer_note ? (
                <p className="mt-2 text-sm">
                  Customer note: {version.response.customer_note}
                </p>
              ) : null}
              {version.links.length ? (
                <ul className="mt-3 space-y-2">
                  {version.links.map((link) => (
                    <li
                      key={link.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs"
                    >
                      <span>
                        {link.revoked_at
                          ? `Revoked (${link.revocation_reason?.replaceAll("_", " ") ?? "unknown"})`
                          : link.active
                            ? "Active link"
                            : "Access expired"}{" "}
                        · {new Date(link.created_at).toLocaleString()}
                      </span>
                      {!link.revoked_at ? (
                        <form action={revokeAction}>
                          <input
                            type="hidden"
                            name="quotationId"
                            value={workflow.quotation_id}
                          />
                          <input type="hidden" name="linkId" value={link.id} />
                          <button
                            type="submit"
                            className="font-semibold text-red-700"
                            disabled={revoking}
                          >
                            Revoke
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        <Result state={revokeState} />
      </div>
      <p className="mt-5 text-xs text-[var(--muted)]">
        Customer names are self-reported. This prototype records a response as evidence but
        does not verify identity or create a digital signature.
      </p>
    </section>
  );
}
