"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/modules/identity/session";
import {
  type CustomerActionState,
  customerFieldErrors,
  customerFormValues,
  customerSchema,
  readCustomerForm,
} from "./validation";

async function saveCustomer(
  id: string | null,
  formData: FormData,
): Promise<CustomerActionState> {
  await requireAuthenticatedUser();
  const raw = readCustomerForm(formData);
  const values = customerFormValues(raw);
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: customerFieldErrors(parsed.error), values };

  let customerId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = id
      ? await supabase.rpc("update_customer", {
          p_customer_id: id,
          p_display_name: parsed.data.displayName,
          p_contact_name: parsed.data.contactName,
          p_email: parsed.data.email,
          p_phone: parsed.data.phone,
          p_billing_address: parsed.data.billingAddress,
          p_state_code: parsed.data.stateCode,
          p_gstin_applicable: parsed.data.gstinApplicable,
          p_gstin: parsed.data.gstin,
        })
      : await supabase.rpc("create_customer", {
          p_display_name: parsed.data.displayName,
          p_contact_name: parsed.data.contactName,
          p_email: parsed.data.email,
          p_phone: parsed.data.phone,
          p_billing_address: parsed.data.billingAddress,
          p_state_code: parsed.data.stateCode,
          p_gstin_applicable: parsed.data.gstinApplicable,
          p_gstin: parsed.data.gstin,
        });
    if (error || !data) {
      return {
        error:
          error?.code === "P0002"
            ? "This customer could not be found in your business."
            : "We couldn't save this customer. Check the details and try again.",
        values,
      };
    }
    customerId = data;
  } catch {
    return {
      error: "Customer management is temporarily unavailable. Please try again.",
      values,
    };
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}`);
}

export async function createCustomerAction(
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  return saveCustomer(null, formData);
}

export async function updateCustomerAction(
  id: string,
  _previousState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  return saveCustomer(id, formData);
}
