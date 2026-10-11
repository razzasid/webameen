import { PaymentDirectory } from "@/components/payments/payment-directory";
import { getBusinessPaymentDashboard } from "@/server/modules/payments/queries";

export default async function PaymentsPage() {
  const dashboard = await getBusinessPaymentDashboard();
  return <PaymentDirectory {...dashboard} />;
}
