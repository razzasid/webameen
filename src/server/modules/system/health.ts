import { publicEnvironment } from "@/config/env";

export function getSystemHealth() {
  return {
    status: "ok" as const,
    databaseConfigured: Boolean(
      publicEnvironment.NEXT_PUBLIC_SUPABASE_URL &&
        publicEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}
