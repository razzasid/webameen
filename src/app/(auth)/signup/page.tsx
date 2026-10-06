import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { signupAction } from "@/server/modules/identity/actions";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return <AuthForm action={signupAction} mode="signup" />;
}
