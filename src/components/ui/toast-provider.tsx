"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Toast = { id: number; message: string };
type ShowErrorToast = (message: string) => void;
const actionStateIds = new WeakMap<object, number>();
let nextActionStateId = 0;

const ToastContext = createContext<ShowErrorToast>(() => {});

function ToastCard({
  id,
  message,
  onDismiss,
}: {
  id: number;
  message: string;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(id), 8000);
    return () => window.clearTimeout(timeout);
  }, [id, onDismiss]);

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-red-200 bg-white p-4 text-sm text-[var(--ink)] shadow-xl shadow-black/10"
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-50 font-bold text-red-700"
      >
        !
      </span>
      <p className="min-w-0 flex-1 pt-1 leading-5">{message}</p>
      <button
        type="button"
        aria-label="Dismiss error notification"
        onClick={() => onDismiss(id)}
        className="rounded-lg px-2 py-1 text-lg leading-none text-[var(--muted-foreground)] hover:bg-[var(--paper)]"
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showError = useCallback<ShowErrorToast>((message) => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, message }].slice(-4));
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={showError}>
      {children}
      <section
        aria-label="Notifications"
        aria-live="assertive"
        className="fixed inset-x-4 bottom-4 z-[100] ml-auto flex max-w-sm flex-col gap-3 sm:left-auto sm:w-96"
      >
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            id={toast.id}
            message={toast.message}
            onDismiss={dismiss}
          />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

function getActionStateId(state: object) {
  const current = actionStateIds.get(state);
  if (current !== undefined) return current;
  const next = ++nextActionStateId;
  actionStateIds.set(state, next);
  return next;
}

export function useSubmissionErrorToast(state: { error?: string; fieldErrors?: object }) {
  const showError = useContext(ToastContext);
  const stateId = getActionStateId(state);
  const lastToastedStateId = useRef<number | null>(null);
  const firstFieldError = Object.values(state.fieldErrors ?? {}).find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  const message = state.error?.trim() || firstFieldError;

  useEffect(() => {
    if (!message || lastToastedStateId.current === stateId) return;
    lastToastedStateId.current = stateId;
    showError(message);
  }, [message, showError, stateId]);
}

export function ActionErrorToast({
  state,
}: {
  state: { error?: string; fieldErrors?: object };
}) {
  useSubmissionErrorToast(state);
  return null;
}
