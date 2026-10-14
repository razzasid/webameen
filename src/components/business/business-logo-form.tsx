"use client";

import { ImageUp, Trash2 } from "lucide-react";
import Image from "next/image";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { BusinessLogoActionState } from "@/server/modules/business/settings-validation";

type Props = {
  initialLogoUrl: string | null;
  action: (
    state: BusinessLogoActionState,
    formData: FormData,
  ) => Promise<BusinessLogoActionState>;
};

export function BusinessLogoForm({ initialLogoUrl, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold text-[var(--ink)]">Quotation logo</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)] sm:text-sm">
          Add a PNG or JPG up to 700 KB. New quotations will show this logo on the shared
          page and PDF.
        </p>
      </div>
      <form action={formAction} className="space-y-4 p-4 sm:p-5">
        {state.error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {state.error}
          </p>
        ) : null}
        {state.saved ? (
          <p
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800"
          >
            Logo settings saved. New quotations will use this setting.
          </p>
        ) : null}
        {initialLogoUrl ? (
          <div className="flex min-h-24 items-center rounded-lg border border-dashed border-[var(--line)] bg-[#f5faf7] p-3">
            <Image
              alt="Current business logo"
              className="max-h-20 max-w-48 object-contain"
              height={80}
              src={initialLogoUrl}
              unoptimized
              width={192}
            />
          </div>
        ) : (
          <p className="rounded-lg bg-[#f5faf7] px-3 py-4 text-sm text-[var(--muted-foreground)]">
            No logo added yet.
          </p>
        )}
        <label
          className="block text-sm font-medium text-[var(--ink)]"
          htmlFor="business-logo-file"
        >
          Choose logo image
          <input
            accept="image/png,image/jpeg"
            className="mt-1.5 block min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--mint)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
            id="business-logo-file"
            name="logo"
            type="file"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} name="intent" type="submit" value="upload">
            <ImageUp aria-hidden="true" />
            {pending ? "Saving…" : "Upload logo"}
          </Button>
          {initialLogoUrl ? (
            <Button
              disabled={pending}
              name="intent"
              type="submit"
              value="remove"
              variant="outline"
            >
              <Trash2 aria-hidden="true" />
              Remove logo
            </Button>
          ) : null}
        </div>
        <p className="text-xs leading-5 text-[var(--muted-foreground)]">
          Quotations already created keep the logo they captured.
        </p>
      </form>
    </section>
  );
}
