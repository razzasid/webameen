import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalKey = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const publicEnvironmentSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalKey,
  })
  .superRefine((environment, context) => {
    const hasUrl = Boolean(environment.NEXT_PUBLIC_SUPABASE_URL);
    const hasKey = Boolean(environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

    if (hasUrl !== hasKey) {
      context.addIssue({
        code: "custom",
        message: "Set both Supabase public values or leave both blank.",
        path: ["NEXT_PUBLIC_SUPABASE_URL"],
      });
    }
  });

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function parsePublicEnvironment(
  source: Record<string, string | undefined>,
): PublicEnvironment {
  return publicEnvironmentSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export const publicEnvironment = parsePublicEnvironment({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

const serverEnvironmentSchema = z.object({
  SUPABASE_QUOTE_BROKER_KEY: optionalKey,
});

export const serverEnvironment = serverEnvironmentSchema.parse({
  SUPABASE_QUOTE_BROKER_KEY: process.env.SUPABASE_QUOTE_BROKER_KEY,
});

export function isSupabaseConfigured(): boolean {
  return Boolean(
    publicEnvironment.NEXT_PUBLIC_SUPABASE_URL &&
      publicEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
