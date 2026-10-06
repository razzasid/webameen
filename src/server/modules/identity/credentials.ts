import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter a valid email address.")
  .toLowerCase()
  .email("Enter a valid email address.");

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

export function safeLoginError(code?: string): string {
  if (code === "email_not_confirmed") {
    return "Confirm your email address before signing in.";
  }

  return "We couldn't sign you in with those details. Check your email and password and try again.";
}

export function safeSignupError(): string {
  return "We couldn't create the account with those details. Try logging in or use another email address.";
}
