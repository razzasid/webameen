import { BusinessSettingsForm } from "@/components/business/business-settings-form";
import { updateBusinessSettingsAction } from "@/server/modules/business/settings-actions";
import { getBusinessSettings } from "@/server/modules/business/settings-queries";
import {
  documentReadiness,
  profileToValues,
} from "@/server/modules/business/settings-validation";

export default async function SettingsPage() {
  const { profile, selectableRateCount } = await getBusinessSettings();
  const readiness = documentReadiness(profile, selectableRateCount);
  return (
    <section className="max-w-4xl">
      <p className="text-sm font-medium text-[var(--brand)]">Workspace</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Settings</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Review the business details that you may choose to copy into future documents.
      </p>
      <aside
        className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-5"
        aria-label="Document readiness"
      >
        <h2 className="text-lg font-semibold">Document readiness</h2>
        {readiness.missing.length ? (
          <>
            <p className="mt-2 text-sm">Complete these details before sharing documents:</p>
            <ul className="mt-2 list-inside list-disc text-sm text-[var(--muted)]">
              {readiness.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-[#22584d]">
            Business document details are ready for future draft and sharing workflows.
          </p>
        )}
        <p className="mt-3 text-sm text-[var(--muted)]">
          Document time zone: {readiness.timeZone}. Dates on future documents will use the
          time zone captured when the document is created.
        </p>
        {readiness.gstinWarning ? (
          <p
            className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            role="status"
          >
            {readiness.gstinWarning}
          </p>
        ) : null}
      </aside>
      <div className="mt-7 rounded-2xl border border-[var(--line)] bg-white p-5 md:p-7">
        <h2 className="text-lg font-semibold">Business document setup</h2>
        <BusinessSettingsForm
          action={updateBusinessSettingsAction}
          initialValues={profileToValues(profile)}
        />
      </div>
    </section>
  );
}
