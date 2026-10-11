import { getSystemHealth } from "@/server/modules/system/health";

export function GET() {
  const health = getSystemHealth();
  return Response.json(health, { status: health.databaseConfigured ? 200 : 503 });
}
