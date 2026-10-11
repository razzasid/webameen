import type { Metadata } from "next";
import { RecoveryRequestForm } from "@/components/auth/recovery-request-form";
import { resendConfirmationAction } from "@/server/modules/identity/actions";

export const metadata: Metadata = { title: "Resend confirmation" };

export default function ResendConfirmationPage() {
  return <RecoveryRequestForm action={resendConfirmationAction} mode="confirmation" />;
}
