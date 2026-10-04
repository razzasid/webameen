"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnvironment } from "@/config/env";

export function createSupabaseBrowserClient() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key } =
    publicEnvironment;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and add the local project values.",
    );
  }

  return createBrowserClient(url, key);
}
