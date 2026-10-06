"use client";

import { useState } from "react";

type ErrorState<Field extends string> = {
  error?: string;
  fieldErrors?: Partial<Record<Field, string>>;
};

export function useFieldErrors<Field extends string>(state: ErrorState<Field>) {
  const [dismissed, setDismissed] = useState<{
    source: ErrorState<Field>;
    fields: ReadonlySet<Field>;
    general: boolean;
  }>(() => ({ source: state, fields: new Set<Field>(), general: false }));

  const current = dismissed.source === state ? dismissed : null;

  function fieldError(field: Field) {
    return current?.fields.has(field) ? undefined : state.fieldErrors?.[field];
  }

  function dismissField(field: Field) {
    setDismissed((previous) => {
      const fields = new Set(previous.source === state ? previous.fields : []);
      fields.add(field);
      return { source: state, fields, general: true };
    });
  }

  return {
    fieldError,
    generalError: current?.general ? undefined : state.error,
    dismissField,
  };
}
