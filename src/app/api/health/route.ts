import { getSystemHealth } from "@/server/modules/system/health";

export function GET() {
  return Response.json(getSystemHealth());
}
