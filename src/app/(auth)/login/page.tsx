import type { Metadata } from "next";
import { AuthPlaceholder } from "@/components/auth/auth-placeholder";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return <AuthPlaceholder mode="login" />;
}
