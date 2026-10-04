import type { Metadata } from "next";
import { AuthPlaceholder } from "@/components/auth/auth-placeholder";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return <AuthPlaceholder mode="signup" />;
}
