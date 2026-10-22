import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter a valid email address.")
  .toLowerCase()
  .email("Enter a valid email address.");

export const recoveryEmailSchema = emailSchema;

export const loginCredentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter a password."),
});

export const signupCredentialsSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Enter a password.")
    .min(6, "Password must be at least 6 characters."),
});

export const newPasswordSchema = z
  .string()
  .min(1, "Enter a new password.")
  .min(6, "Password must be at least 6 characters.");

export type AuthActionState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
  notice?: string;
};

export function credentialFieldErrors(error: z.ZodError): AuthActionState["fieldErrors"] {
  const fieldErrors: NonNullable<AuthActionState["fieldErrors"]> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === "email" || field === "password") && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

export function readCredentials(formData: FormData) {
  return {
    email: formData.get("email"),
    password: formData.get("password"),
  };
}

export function readEmail(formData: FormData) {
  return formData.get("email");
}

const loginErrorMessages: Record<string, string> = {
  email_not_confirmed: "Confirm your email address before signing in.",
  invalid_credentials:
    "The email address or password is incorrect. Check them and try again.",
  user_not_found: "The email address or password is incorrect. Check them and try again.",
  user_banned:
    "This account is temporarily unavailable. Contact your workspace administrator.",
  over_request_rate_limit: "Too many sign-in attempts. Wait a few minutes, then try again.",
  email_address_not_authorized:
    "This email address is not allowed to sign in. Contact your workspace administrator.",
  email_provider_disabled:
    "Email sign-in is disabled. Contact your workspace administrator.",
};

const signupErrorMessages: Record<string, string> = {
  email_exists:
    "An account may already exist for this email. Try logging in or resetting your password.",
  user_already_exists:
    "An account may already exist for this email. Try logging in or resetting your password.",
  weak_password: "Choose a stronger password and try again.",
  signup_disabled:
    "New account sign-up is currently disabled. Contact your workspace administrator.",
  email_provider_disabled:
    "Email sign-up is disabled. Contact your workspace administrator.",
  over_email_send_rate_limit:
    "Too many confirmation emails were requested. Wait a few minutes before trying again.",
  over_request_rate_limit: "Too many sign-up attempts. Wait a few minutes, then try again.",
  email_address_invalid: "Enter a valid email address.",
  email_address_not_authorized:
    "This email address is not allowed to sign up. Contact your workspace administrator.",
  captcha_failed:
    "The security check could not be completed. Refresh the page and try again.",
};

export function safeLoginError(code?: string): string {
  if (code && Object.hasOwn(loginErrorMessages, code)) return loginErrorMessages[code];
  return "We couldn't sign you in right now. Please try again. If the problem continues, contact support.";
}

export function isKnownLoginErrorCode(code?: string): boolean {
  return Boolean(code && Object.hasOwn(loginErrorMessages, code));
}

export function safeSignupError(code?: string): string {
  if (code && Object.hasOwn(signupErrorMessages, code)) return signupErrorMessages[code];
  return "We couldn't create the account right now. Please try again. If the problem continues, contact support.";
}

export function isKnownSignupErrorCode(code?: string): boolean {
  return Boolean(code && Object.hasOwn(signupErrorMessages, code));
}
