import "server-only";

import { publicEnvironment } from "@/config/env";

export const BUSINESS_LOGO_BUCKET = "webameen-quotation-logos";

const assetKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/;

export function businessLogoPublicUrl(assetKey: unknown): string | null {
  const baseUrl = publicEnvironment.NEXT_PUBLIC_SUPABASE_URL;
  if (typeof assetKey !== "string" || !assetKeyPattern.test(assetKey) || !baseUrl) {
    return null;
  }
  const path = assetKey.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUSINESS_LOGO_BUCKET}/${path}`;
}
