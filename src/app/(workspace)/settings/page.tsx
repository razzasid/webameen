import {
  AlertCircle,
  BadgeInfo,
  Building2,
  CheckCircle2,
  CreditCard,
  Hash,
} from "lucide-react";
import { BusinessSettingsForm } from "@/components/business/business-settings-form";
import { InvoiceNumberingSettings } from "@/components/invoices/invoice-numbering-settings";
import { updateBusinessSettingsAction } from "@/server/modules/business/settings-actions";
import { getBusinessSettings } from "@/server/modules/business/settings-queries";
import {
  documentReadiness,
  profileToValues,
} from "@/server/modules/business/settings-validation";
import { stateLabel } from "@/server/modules/business/states";
import { configureInvoiceNumberPeriodAction } from "@/server/modules/invoices/actions";
import { listInvoiceNumberPeriods } from "@/server/modules/invoices/queries";

function InfoCard({
  icon,
  title,
  children,
  tone = "mint",
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  tone?: "mint" | "amber";
}) {
  return (
    <section
      className={`rounded-xl border p-4 sm:p-5 ${tone === "amber" ? "border-amber-200 bg-[#fffaf0]" : "border-[#d5ece2] bg-[#f5faf7]"}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone === "amber" ? "bg-[#fff0cf] text-[#8d5400]" : "bg-[#e2f2eb] text-[var(--brand)]"}`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--ink)]">{title}</h2>
          <div className="mt-1.5 text-xs leading-5 text-[var(--muted-foreground)] sm:text-sm">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function SettingsPage() {
  const [{ profile, selectableRateCount }, periods] = await Promise.all([
    getBusinessSettings(),
    listInvoiceNumberPeriods(),
  ]);
  const readiness = documentReadiness(profile, selectableRateCount);
  const contactDetails = [profile.contact_phone, profile.contact_email].filter(Boolean);

  return (
    <section className="mx-auto w-full max-w-[1380px] min-w-0 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">
          Workspace
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[var(--ink)] sm:text-[2rem]">
          Settings
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted-foreground)]">
          Manage business details, tax settings, document defaults, and invoice numbering.
        </p>
      </div>

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(270px,0.75fr)] xl:gap-6">
        <div className="min-w-0 space-y-5">
          <BusinessSettingsForm
            action={updateBusinessSettingsAction}
            initialValues={profileToValues(profile)}
          />
          <InvoiceNumberingSettings
            periods={periods}
            action={configureInvoiceNumberPeriodAction}
          />
        </div>

        <aside aria-label="Settings guidance" className="space-y-4 xl:sticky xl:top-4">
          <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e2f2eb] text-[var(--brand)]">
                <Building2 aria-hidden="true" className="size-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[var(--ink)]">
                  Business information
                </h2>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  Preview from your saved settings
                </p>
              </div>
            </div>
            <dl className="space-y-3 p-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                  Business name
                </dt>
                <dd className="mt-0.5 break-words font-semibold text-[var(--ink)]">
                  {profile.display_name || "Not added"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                  Business address
                </dt>
                <dd className="mt-0.5 break-words whitespace-pre-line text-[var(--ink)]">
                  {profile.postal_address || "Not added"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                  State or territory
                </dt>
                <dd className="mt-0.5 text-[var(--ink)]">
                  {profile.state_code ? stateLabel(profile.state_code) : "Not selected"}
                </dd>
              </div>
              {contactDetails.length ? (
                <div>
                  <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                    Contact
                  </dt>
                  <dd className="mt-0.5 break-all text-[var(--ink)]">
                    {contactDetails.join(" · ")}
                  </dd>
                </div>
              ) : null}
              {profile.gst_registered && profile.gstin ? (
                <div>
                  <dt className="text-xs font-medium text-[var(--muted-foreground)]">
                    GSTIN
                  </dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-[var(--ink)]">
                    {profile.gstin}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          <InfoCard
            icon={
              readiness.missing.length ? (
                <AlertCircle aria-hidden="true" className="size-5" />
              ) : (
                <CheckCircle2 aria-hidden="true" className="size-5" />
              )
            }
            title="Document readiness"
            tone={readiness.missing.length ? "amber" : "mint"}
          >
            {readiness.missing.length ? (
              <>
                <p>Complete these details before sharing documents:</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {readiness.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                Business document details are ready for future draft and sharing workflows.
              </p>
            )}
            <p className="mt-3">
              Document time zone: <strong>{readiness.timeZone}</strong>. New documents
              capture the selected time zone when created.
            </p>
            {readiness.gstinWarning ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-white p-3 text-amber-950">
                {readiness.gstinWarning}
              </p>
            ) : null}
          </InfoCard>

          <InfoCard
            icon={<BadgeInfo aria-hidden="true" className="size-5" />}
            title="GSTIN details"
          >
            <p>
              The form checks the basic GSTIN format only. It does not verify registration
              with a government service.
            </p>
          </InfoCard>

          <InfoCard
            icon={<CreditCard aria-hidden="true" className="size-5" />}
            title="Payment details"
          >
            <p>
              Bank, UPI, and payment instructions are optional defaults. They can be
              selected while preparing a document.
            </p>
          </InfoCard>

          <InfoCard
            icon={<Hash aria-hidden="true" className="size-5" />}
            title="Number formats"
          >
            <p>Use only the placeholders supported by the numbering form.</p>
            <div className="mt-3 space-y-2 rounded-lg border border-[var(--line)] bg-white p-3 font-mono text-[11px]">
              <p className="break-all">{"{prefix}/{period}/{number}"}</p>
              <p className="break-all">{"{prefix}-{number}"}</p>
              <p className="break-all">{"{number}"}</p>
            </div>
            <p className="mt-3">
              A period’s dates and format lock after an invoice is issued in that period.
            </p>
          </InfoCard>
        </aside>
      </div>
    </section>
  );
}
