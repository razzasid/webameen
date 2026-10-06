import { type NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/config/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code && isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    } catch {
      // The login page provides a safe, non-technical recovery message.
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirmation", request.url));
}
