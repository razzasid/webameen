import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnvironment, serverEnvironment } from "@/config/env";

export function createReminderWorkerClient() {
  const url = publicEnvironment.NEXT_PUBLIC_SUPABASE_URL;
  // Use service role key if available, or invoice broker secret key which has database access
  const key =
    serverEnvironment.SUPABASE_SERVICE_ROLE_KEY ||
    serverEnvironment.WEBAMEEN_REMINDER_WORKER_KEY ||
    serverEnvironment.SUPABASE_INVOICE_BROKER_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase worker environment is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_INVOICE_BROKER_KEY.",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
