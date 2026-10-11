import { InvoiceDirectory } from "@/components/invoices/invoice-directory";
import { listInvoices } from "@/server/modules/invoices/queries";
import { getInvoicePaymentSummary } from "@/server/modules/payments/queries";

export default async function InvoicesPage() {
  const invoices = await listInvoices();
  const invoicesWithPayments = [];
  const batchSize = 20;
  for (let offset = 0; offset < invoices.length; offset += batchSize) {
    const batch = invoices.slice(offset, offset + batchSize);
    invoicesWithPayments.push(
      ...(await Promise.all(
        batch.map(async (invoice) => {
          const payment = await getInvoicePaymentSummary(invoice.id);
          return {
            ...invoice,
            payment: {
              payment_status: payment.payment_status,
              paid_minor: payment.paid_minor,
              outstanding_minor: payment.outstanding_minor,
              overdue: payment.overdue,
            },
          };
        }),
      )),
    );
  }

  return <InvoiceDirectory invoices={invoicesWithPayments} />;
}
