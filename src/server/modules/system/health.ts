import { type PublicEnvironment, publicEnvironment } from "@/config/env";

export function getSystemHealth(environment: PublicEnvironment = publicEnvironment) {
  const configured = Boolean(
    environment.NEXT_PUBLIC_SUPABASE_URL &&
      environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return {
    status: configured ? ("ready" as const) : ("not_ready" as const),
    databaseConfigured: configured,
  };
}
