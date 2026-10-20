"use client";

import { Check, Copy, LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useSubmissionErrorToast } from "@/components/ui/toast-provider";
import type { QuotationWorkflowActionState } from "@/server/modules/quotations/actions";
import {
  createQuotationRevisionAction,
  revokeQuotationLinkAction,
  rotateQuotationLinkAction,
  shareQuotationAction,
} from "@/server/modules/quotations/actions";
import type { QuotationWorkflow } from "@/server/modules/quotations/queries";
import type { QuoteShareBlocker } from "@/server/modules/quotations/validation";
import styles from "./quotation-workflow-panel.module.css";

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
          <ShareLink key={state.rawToken} token={state.rawToken} />
        </div>
      ) : null}
    </>
  );
}

function ShareLink({ token }: { token: string }) {
  const url = `/q/${token}`;
  const [shareUrl, setShareUrl] = useState(url);
  const [copyState, setCopyState] = useState<{
    status: "idle" | "copying" | "copied" | "error";
    attempt: number;
    error?: string;
  }>({ status: "idle", attempt: 0 });
  const linkInput = useRef<HTMLInputElement>(null);
  const copying = useRef(false);
  const attempt = useRef(0);
  useSubmissionErrorToast(copyState);
  useEffect(() => setShareUrl(new URL(url, window.location.origin).toString()), [url]);
  useEffect(() => {
    if (copyState.status !== "copied") return;
    const timeout = window.setTimeout(() => {
      setCopyState((current) =>
        current === copyState ? { status: "idle", attempt: current.attempt } : current,
      );
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  async function copyLink() {
    if (copying.current) return;
    copying.current = true;
    const currentAttempt = ++attempt.current;
    setCopyState({ status: "copying", attempt: currentAttempt });
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
      setCopyState({ status: "copied", attempt: currentAttempt });
    } catch {
      setCopyState({
        status: "error",
        attempt: currentAttempt,
        error: "Couldn’t copy the link. Copy the selected link manually, or try again.",
      });
      linkInput.current?.focus();
      linkInput.current?.select();
    } finally {
      copying.current = false;
    }
  }

  const copied = copyState.status === "copied";
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input
          ref={linkInput}
          aria-label="Quotation link"
          readOnly
          value={shareUrl}
          className="min-w-0 flex-1 rounded-lg border border-green-300 bg-white px-3 py-2 text-xs"
        />
        <button
          type="button"
          onClick={copyLink}
          disabled={copyState.status === "copying"}
          aria-busy={copyState.status === "copying"}
          className={`inline-flex min-w-[124px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-4 py-3 text-sm font-semibold transition-colors duration-200 disabled:opacity-60 motion-safe:active:scale-95 motion-reduce:transition-none ${copied ? "border-emerald-700 bg-emerald-700 text-white" : "border-[var(--line)] bg-white text-[var(--ink)] hover:bg-emerald-50"}`}
        >
          {copied ? (
            <Check
              key={copyState.attempt}
              aria-hidden="true"
              className={`size-4 ${styles.copySuccess}`}
            />
          ) : copyState.status === "copying" ? (
            <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copied ? "Copied!" : copyState.status === "copying" ? "Copying…" : "Copy"}
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`mt-1 min-h-5 text-xs ${copyState.error ? "text-red-700" : "text-emerald-800"}`}
      >
        {copied
          ? "Link copied to clipboard."
          : (copyState.error ??
            (copyState.status === "copying" ? "Copying quotation link…" : ""))}
      </p>
    </div>
  );
}

export function QuotationWorkflowPanel({
  workflow,
  shareRequestKey,
  rotateRequestKey,
  shareBlockers,
}: {
  workflow: QuotationWorkflow;
  shareRequestKey: string;
  rotateRequestKey: string;
  shareBlockers: QuoteShareBlocker[];
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
  useSubmissionErrorToast(shareState);
  useSubmissionErrorToast(rotateState);
  useSubmissionErrorToast(revokeState);
  useSubmissionErrorToast(revisionState);
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
          <p className="text-sm text-[var(--muted-foreground)]">
            Sharing freezes this draft and creates a private link for the customer.
          </p>
          {shareBlockers.length ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-semibold">Complete these details before sharing:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {shareBlockers.map((blocker) => (
                  <li key={`${blocker.target}-${blocker.label}`}>
                    <a className="underline" href={`#${blocker.target}`}>
                      {blocker.label}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                After filling them in, click <strong>Save draft</strong>. This checklist
                checks the saved draft.
              </p>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Required details are complete. Save any new changes before sharing. Valid
              through is optional.
            </p>
          )}
          <button
            type="submit"
            className={`${buttonClass} mt-3`}
            disabled={sharing || shareBlockers.length > 0}
          >
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
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
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
          <p className="text-sm text-[var(--muted-foreground)]">
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
      <p className="mt-5 text-xs text-[var(--muted-foreground)]">
        Customer names are self-reported. Responses are recorded as evidence but do not
        verify identity or create a digital signature.
      </p>
    </section>
  );
}
