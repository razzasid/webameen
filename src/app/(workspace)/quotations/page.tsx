import { QuotationsList } from "@/components/quotations/quotations-list";
import { listQuotationDrafts } from "@/server/modules/quotations/queries";

export default async function QuotationsPage() {
  const quotations = await listQuotationDrafts();

  return <QuotationsList quotations={quotations} />;
}
