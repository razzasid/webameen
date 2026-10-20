import type { BusinessProfile } from "@/server/modules/business/settings-validation";
import type { CustomerChoice, QuoteDraft } from "./queries";
import { type QuoteSnapshotInput, toRpcSnapshot } from "./validation";

export function customerQuotationFields(customer: CustomerChoice) {
  return {
    buyerDisplayName: customer.display_name,
    buyerContactName: customer.contact_name ?? "",
    buyerEmail: customer.email ?? "",
    buyerPhone: customer.phone ?? "",
    buyerBillingAddress: customer.billing_address ?? "",
    buyerStateCode: customer.state_code ?? "",
    buyerGstinApplicable:
      customer.gstin_applicable === null || customer.gstin_applicable === undefined
        ? ("unset" as const)
        : customer.gstin_applicable
          ? ("yes" as const)
          : ("no" as const),
    buyerGstin: customer.gstin ?? "",
  };
}

export function newQuotationDraft(
  profile: BusinessProfile,
  requestKey: string,
): QuoteDraft {
  const snapshot: QuoteSnapshotInput = {
    sellerDisplayName: profile.display_name,
    sellerContactEmail: profile.contact_email ?? "",
    sellerContactPhone: profile.contact_phone ?? "",
    sellerPostalAddress: profile.postal_address ?? "",
    sellerStateCode: profile.state_code ?? "",
    sellerGstRegistered:
      profile.gst_registered === null ? "unset" : profile.gst_registered ? "yes" : "no",
    sellerGstin: profile.gstin ?? "",
    buyerDisplayName: "",
    buyerContactName: "",
    buyerEmail: "",
    buyerPhone: "",
    buyerBillingAddress: "",
    buyerStateCode: "",
    buyerGstinApplicable: "unset",
    buyerGstin: "",
    documentTimeZone: profile.time_zone || "Asia/Kolkata",
    gstTreatmentOverride: "",
    placeOfSupplyApplicable: "no",
    placeOfSupplyStateCode: "",
    placeOfSupplyText: "",
    reverseChargeApplies: "no",
    validUntil: "",
    sellerBankName: "",
    sellerBankAccountName: "",
    sellerBankAccountNumber: "",
    sellerBankIfsc: "",
    sellerUpiId: "",
    paymentInstructions: "",
    terms: "",
  };
  return {
    id: requestKey,
    reference: "Not saved yet",
    customer_id: "",
    version_id: "",
    version_number: 1,
    state: "draft",
    edit_sequence: 0,
    created_at: "",
    updated_at: "",
    snapshot: toRpcSnapshot(snapshot),
    totals: {
      subtotal_minor: "0",
      taxable_subtotal_minor: "0",
      cgst_total_minor: "0",
      sgst_total_minor: "0",
      igst_total_minor: "0",
      gst_total_minor: "0",
      total_minor: "0",
    },
    lines: [],
  };
}
