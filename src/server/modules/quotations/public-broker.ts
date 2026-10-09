import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnvironment, serverEnvironment } from "@/config/env";

export type PublicQuotation = {
  reference: string;
  version_number: number;
  state: string;
  revision_in_preparation: boolean;
  valid_until: string | null;
  response_deadline_at: string | null;
  response_deadline_passed: boolean;
  seller: Record<string, string | boolean | null>;
  buyer: Record<string, string | boolean | null>;
  document: Record<string, string | boolean | null>;
  totals: Record<string, string>;
  lines: Array<Record<string, string | number | null>>;
  response: {
    kind: string;
    customer_note: string | null;
    respondent_name: string | null;
    responded_at: string;
  } | null;
};

function createQuoteBrokerClient() {
  const { NEXT_PUBLIC_SUPABASE_URL: url } = publicEnvironment;
  const { SUPABASE_QUOTE_BROKER_KEY: key } = serverEnvironment;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function readPublicQuotation(tokenHashHex: string) {
  const client = createQuoteBrokerClient();
  if (!client) return { data: null, error: new Error("Quote access is not configured.") };
  return client.rpc("read_public_quotation", { p_token_hash_hex: tokenHashHex });
}

export async function respondToPublicQuotation(input: {
  tokenHashHex: string;
  kind: "approved" | "change_requested";
  customerNote: string | null;
  respondentName: string | null;
}) {
  const client = createQuoteBrokerClient();
  if (!client) return { data: null, error: new Error("Quote access is not configured.") };
  return client.rpc("respond_to_public_quotation", {
    p_token_hash_hex: input.tokenHashHex,
    p_kind: input.kind,
    p_customer_note: input.customerNote,
    p_respondent_name: input.respondentName,
  });
}
