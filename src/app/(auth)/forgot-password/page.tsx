import type { Metadata } from "next";
import { RecoveryRequestForm } from "@/components/auth/recovery-request-form";
import { requestPasswordResetAction } from "@/server/modules/identity/actions";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return <RecoveryRequestForm action={requestPasswordResetAction} mode="password" />;
}
