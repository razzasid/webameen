export type CustomerTimelineEvent = {
  id: string;
  kind: "quotation" | "invoice" | "payment" | "reversal" | "receipt";
  title: string;
  detail: string;
  occurredAt: string;
  href: string;
  amountMinor?: string;
};

export function paginateCustomerTimeline(
  events: CustomerTimelineEvent[],
  requestedPage: number,
  pageSize = 10,
) {
  const ordered = [...events].sort((first, second) => {
    const byDate = Date.parse(second.occurredAt) - Date.parse(first.occurredAt);
    if (byDate) return byDate;
    const byKind = first.kind.localeCompare(second.kind);
    return byKind || first.id.localeCompare(second.id);
  });
  const total = ordered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    totalPages,
  );
  const offset = (page - 1) * pageSize;
  return {
    events: ordered.slice(offset, offset + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}
