import "server-only";

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";

export const getBusinessContext = cache(async function getBusinessContext() {
  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();
  const membershipResult = await supabase
    .from("business_memberships")
    .select("business_id, role, disabled_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipResult.error) throw new Error("Could not load business membership.");
  const membership = membershipResult.data;
  if (!membership) return { status: "needs_setup" as const, user };
  if (membership.disabled_at || membership.role !== "owner") {
    return { status: "disabled" as const, user };
  }

  const businessResult = await supabase
    .from("businesses")
    .select("id, display_name, state_code, gstin")
    .eq("id", membership.business_id)
    .maybeSingle();
  if (businessResult.error || !businessResult.data) {
    throw new Error("Could not load the authorized business.");
  }
  return { status: "ready" as const, user, business: businessResult.data };
});
