import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusinessContext } from "./context";
import type { BusinessProfile } from "./settings-validation";

export async function getBusinessSettings() {
  const context = await getBusinessContext();
  if (context.status !== "ready") throw new Error("Business access unavailable.");
  const supabase = await createSupabaseServerClient();
  const [profile, rates] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        "id,display_name,contact_email,contact_phone,postal_address,country_code,currency_code,state_code,gst_registered,gstin,default_terms,time_zone,bank_name,bank_account_name,bank_account_number,bank_ifsc,upi_id,payment_instructions",
      )
      .eq("id", context.business.id)
      .single(),
    supabase.rpc("list_catalog_gst_rates"),
  ]);
  if (profile.error || !profile.data) throw new Error("Could not load business settings.");
  if (rates.error) throw new Error("Could not load configured GST rates.");
  return {
    profile: profile.data as BusinessProfile,
    selectableRateCount: rates.data?.length ?? 0,
  };
}
