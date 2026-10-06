"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/config/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type AuthActionState,
  loginCredentialsSchema,
  readCredentials,
  safeLoginError,
  safeSignupError,
  signupCredentialsSchema,
} from "@/server/modules/identity/credentials";

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = loginCredentialsSchema.safeParse(readCredentials(formData));
  if (!credentials.success) {
    return {
      error: credentials.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  if (!isSupabaseConfigured()) {
    return {
      error:
        "Authentication is not configured. Add the Supabase values from the setup instructions.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(credentials.data);
    if (error) {
      return { error: safeLoginError(error.code) };
    }
  } catch {
    return { error: "Sign-in is temporarily unavailable. Please try again." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signupAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = signupCredentialsSchema.safeParse(readCredentials(formData));
  if (!credentials.success) {
    return {
      error: credentials.error.issues[0]?.message ?? "Check the form and try again.",
    };
  }
  if (!isSupabaseConfigured()) {
    return {
      error:
        "Authentication is not configured. Add the Supabase values from the setup instructions.",
    };
  }
  const appUrl = getAppUrl();
  if (!appUrl) {
    return { error: "Account setup is unavailable. Please contact the administrator." };
  }

  let hasSession = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      ...credentials.data,
      options: {
        emailRedirectTo: `${appUrl}/auth/callback`,
      },
    });

    if (error) {
      return { error: safeSignupError() };
    }
    hasSession = Boolean(data.session);
  } catch {
    return { error: safeSignupError() };
  }

  if (hasSession) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  return {
    notice:
      "If this email can be registered, we’ll send a confirmation link. Confirm your email, then log in.",
  };
}

export async function logoutAction(): Promise<void> {
  let signOutFailed = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signOut({ scope: "local" });
      signOutFailed = Boolean(error);
    } catch {
      signOutFailed = true;
    }
  }

  if (signOutFailed) {
    redirect("/dashboard?logout=failed");
  }

  revalidatePath("/", "layout");
  redirect("/login");
}

function getAppUrl() {
  const configuredUrl = process.env.APP_URL?.trim();
  if (!configuredUrl) {
    return process.env.NODE_ENV === "production" ? null : "http://127.0.0.1:3000";
  }

  try {
    const url = new URL(configuredUrl);
    if (url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname)) {
      return url.origin;
    }
  } catch {
    // Keep redirects on the safe local default when configuration is invalid.
  }

  return process.env.NODE_ENV === "production" ? null : "http://127.0.0.1:3000";
}
