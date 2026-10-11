import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusinessContext } from "@/server/modules/business/context";
import { listInvoices } from "@/server/modules/invoices/queries";
import { getInvoicePaymentSummary } from "@/server/modules/payments/queries";
import { listQuotationDrafts } from "@/server/modules/quotations/queries";
import { deriveDashboardOverview } from "./overview-model";

export async function getDashboardOverview() {
  const context = await getBusinessContext();
  if (context.status !== "ready") return null;
  const supabase = await createSupabaseServerClient();

  const [customerCountResult, customersResult, businessResult, quotes, invoices] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("business_id", context.business.id)
        .is("archived_at", null),
      supabase
        .from("customers")
        .select("id,display_name,created_at")
        .eq("business_id", context.business.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(8),
      supabase
        .from("businesses")
        .select("time_zone")
        .eq("id", context.business.id)
        .maybeSingle(),
      listQuotationDrafts(),
      listInvoices(),
    ]);

  if (customerCountResult.error || customersResult.error || businessResult.error) {
    throw new Error("Could not load the business overview.");
  }

  const paymentSummaries = await Promise.all(
    invoices.map((invoice) => getInvoicePaymentSummary(invoice.id)),
  );

  return {
    businessName: context.business.display_name,
    timeZone: businessResult.data?.time_zone ?? "Asia/Kolkata",
    overview: deriveDashboardOverview({
      customerCount: customerCountResult.count ?? 0,
      quotes,
      invoices,
      paymentSummaries,
      customers: customersResult.data ?? [],
    }),
  };
}
