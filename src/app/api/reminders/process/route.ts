import { type NextRequest, NextResponse } from "next/server";
import { serverEnvironment } from "@/config/env";
import { processDueReminders } from "@/server/modules/reminders/processor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Authorize the background worker/cron caller
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const querySecret = request.nextUrl.searchParams.get("secret");
  const providedSecret = bearerToken || querySecret;

  const expectedSecret =
    serverEnvironment.CRON_SECRET ||
    serverEnvironment.WEBAMEEN_REMINDER_WORKER_KEY ||
    serverEnvironment.SUPABASE_SERVICE_ROLE_KEY;

  if (expectedSecret && providedSecret !== expectedSecret) {
    return NextResponse.json(
      { error: "Unauthorized. Valid cron secret required." },
      { status: 401 },
    );
  }

  // If in production and no secret is configured, reject for security
  if (process.env.NODE_ENV === "production" && !expectedSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET must be configured in production." },
      { status: 500 },
    );
  }

  try {
    const batchSizeParam = request.nextUrl.searchParams.get("batch");
    const batchSize = batchSizeParam ? Number(batchSizeParam) : 25;

    const result = await processDueReminders({ batchSize });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Support GET only for health checks or webhook triggers that use GET with secret
  return POST(request);
}
