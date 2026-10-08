"use client";

import { useActionState } from "react";

export function CatalogPublicationForm({
  action,
  published,
}: {
  action: (state: { error?: string }, data: FormData) => Promise<{ error?: string }>;
  published: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-4">
      {state.error ? (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-60"
      >
        {pending
          ? "Updating publication…"
          : published
            ? "Unpublish item"
            : "Publish to public catalog"}
      </button>
    </form>
  );
}
