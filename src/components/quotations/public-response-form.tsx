"use client";

import { Check, MessageSquare } from "lucide-react";
import { useActionState, useState } from "react";
import { useSubmissionErrorToast } from "@/components/ui/toast-provider";
import {
  type PublicResponseState,
  respondToQuotationAction,
} from "@/server/modules/quotations/public-actions";
import styles from "./quotation-document.module.css";

const initialState: PublicResponseState = {};
export function PublicResponseForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(respondToQuotationAction, initialState);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  useSubmissionErrorToast(state);
  return (
    <form action={action} className={styles.responseForm}>
      <input type="hidden" name="token" value={token} />
      <label className={styles.fieldLabel}>
        Your name (optional)
        <input
          name="respondentName"
          maxLength={200}
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={styles.field}
        />
      </label>
      <label className={styles.fieldLabel}>
        Note (optional)
        <textarea
          name="customerNote"
          maxLength={2000}
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={styles.field}
        />
      </label>
      {state.error ? (
        <p role="alert" className={styles.responseError}>
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className={styles.responseSuccess}>
          {state.message}
        </p>
      ) : null}
      <div className={styles.responseActions}>
        <button
          type="submit"
          name="kind"
          value="approved"
          disabled={pending || Boolean(state.message)}
          className={styles.responseButton}
        >
          <Check size={14} aria-hidden="true" />
          {pending ? "Sending…" : "Approve quotation"}
        </button>
        <button
          type="submit"
          name="kind"
          value="change_requested"
          disabled={pending || Boolean(state.message)}
          className={`${styles.responseButton} ${styles.secondaryButton}`}
        >
          <MessageSquare size={14} aria-hidden="true" />
          Request changes
        </button>
      </div>
      <p className={styles.responseHint}>
        Your name is self-reported and is not a verified signature. Only one response can be
        recorded for this version.
      </p>
    </form>
  );
}
