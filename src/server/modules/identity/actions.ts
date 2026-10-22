"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/config/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type AuthActionState,
  credentialFieldErrors,
  isKnownLoginErrorCode,
  isKnownSignupErrorCode,
  loginCredentialsSchema,
  newPasswordSchema,
  readCredentials,
  readEmail,
  recoveryEmailSchema,
  safeLoginError,
  safeSignupError,
  signupCredentialsSchema,
} from "@/server/modules/identity/credentials";
import { reportSafeFailure } from "@/server/observability/report-safe-failure";

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = loginCredentialsSchema.safeParse(readCredentials(formData));
  if (!credentials.success) {
    return { fieldErrors: credentialFieldErrors(credentials.error) };
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
      return {
        error: isKnownLoginErrorCode(error.code)
          ? safeLoginError(error.code)
          : reportSafeFailure(
              "auth.login",
              error,
              "We couldn't sign you in right now. Please try again.",
            ),
      };
    }
  } catch (error) {
    return {
      error: reportSafeFailure(
        "auth.login",
        error,
        "Sign-in is temporarily unavailable. Please try again.",
      ),
    };
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
    return { fieldErrors: credentialFieldErrors(credentials.error) };
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
      return {
        error: isKnownSignupErrorCode(error.code)
          ? safeSignupError(error.code)
          : reportSafeFailure(
              "auth.signup",
              error,
              "We couldn't create the account right now. Please try again.",
            ),
      };
    }
    hasSession = Boolean(data.session);
  } catch (error) {
    return {
      error: reportSafeFailure(
        "auth.signup",
        error,
        "We couldn't connect to the account service. Check your connection and try again.",
      ),
    };
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

export async function requestPasswordResetAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = recoveryEmailSchema.safeParse(readEmail(formData));
  if (!email.success) {
    return {
      fieldErrors: {
        email: email.error.issues[0]?.message ?? "Enter a valid email address.",
      },
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
    return { error: "Password recovery is temporarily unavailable. Please try again." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: makePasswordResetRedirect(appUrl),
    });
    if (error) {
      return { error: "Password recovery is temporarily unavailable. Please try again." };
    }
  } catch (error) {
    return {
      error: reportSafeFailure(
        "auth.password_recovery.request",
        error,
        "Password recovery is temporarily unavailable. Please try again.",
      ),
    };
  }

  return { notice: "If an account matches this email, we’ll send a password reset link." };
}

export async function resendConfirmationAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = recoveryEmailSchema.safeParse(readEmail(formData));
  if (!email.success) {
    return {
      fieldErrors: {
        email: email.error.issues[0]?.message ?? "Enter a valid email address.",
      },
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
    return { error: "Confirmation email is temporarily unavailable. Please try again." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.data,
      options: { emailRedirectTo: `${appUrl}/auth/callback` },
    });
    if (error) {
      return { error: "Confirmation email is temporarily unavailable. Please try again." };
    }
  } catch (error) {
    return {
      error: reportSafeFailure(
        "auth.confirmation.resend",
        error,
        "Confirmation email is temporarily unavailable. Please try again.",
      ),
    };
  }

  return { notice: "If this email is awaiting confirmation, we’ll send a new link." };
}

export async function updatePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = newPasswordSchema.safeParse(formData.get("password"));
  if (!password.success) {
    return {
      fieldErrors: {
        password: password.error.issues[0]?.message ?? "Enter a new password.",
      },
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
    const {
      data: { user },
      error: sessionError,
    } = await supabase.auth.getUser();
    if (sessionError || !user) {
      return {
        error: "This reset link is invalid or expired. Request a new password reset link.",
      };
    }
    const { error } = await supabase.auth.updateUser({ password: password.data });
    if (error) {
      return {
        error: "We couldn’t update your password. Request a new reset link and try again.",
      };
    }
  } catch (error) {
    return {
      error: reportSafeFailure(
        "auth.password.update",
        error,
        "We couldn’t update your password. Request a new reset link and try again.",
      ),
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
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

function makePasswordResetRedirect(appUrl: string) {
  const callbackUrl = new URL("/auth/callback", appUrl);
  callbackUrl.searchParams.set("next", "/reset-password");
  return callbackUrl.toString();
}
