import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { isSupabaseConfigured } from "@/config/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getAuthenticatedUser = cache(async function getAuthenticatedUser() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return null;
    }

    return data.user;
  } catch {
    return null;
  }
});

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function redirectAuthenticatedUser() {
  if (await getAuthenticatedUser()) {
    redirect("/dashboard");
  }
}
