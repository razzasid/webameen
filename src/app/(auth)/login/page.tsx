import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { loginAction } from "@/server/modules/identity/actions";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthForm
      action={loginAction}
      initialNotice={
        error === "confirmation"
          ? "That confirmation link could not be used. Try signing in or create a new account."
          : undefined
      }
      mode="login"
    />
  );
}
