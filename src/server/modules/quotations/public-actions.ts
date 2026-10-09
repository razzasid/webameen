"use server";

import { headers } from "next/headers";
import { respondToPublicQuotation } from "./public-broker";
import { allowPublicQuotationRequest } from "./rate-limit";
import { hashQuotationToken } from "./token";

export type PublicResponseState = { error?: string; message?: string };

export async function respondToQuotationAction(
  _previous: PublicResponseState,
  formData: FormData,
): Promise<PublicResponseState> {
  const token = String(formData.get("token") ?? "");
  const tokenHashHex = hashQuotationToken(token);
  const kind = String(formData.get("kind") ?? "");
  const noteInput = String(formData.get("customerNote") ?? "").trim();
  const nameInput = String(formData.get("respondentName") ?? "").trim();
  if (!tokenHashHex || !["approved", "change_requested"].includes(kind))
    return { error: "This quotation link is unavailable." };
  if (noteInput.length > 2000 || nameInput.length > 200)
    return {
      error: "Keep your name under 200 characters and your note under 2,000 characters.",
    };

  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get("x-real-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown-client";
  if (!allowPublicQuotationRequest(clientAddress, "respond"))
    return { error: "Too many attempts. Please wait a minute and try again." };

  try {
    const { data, error } = await respondToPublicQuotation({
      tokenHashHex,
      kind: kind as "approved" | "change_requested",
      customerNote: noteInput || null,
      respondentName: nameInput || null,
    });
    if (error) return { error: "We could not record your response. Please try again." };
    const result = data as { status?: string } | null;
    switch (result?.status) {
      case "recorded":
        return { message: "Your response has been recorded." };
      case "already_responded":
        return { error: "A response has already been recorded for this version." };
      case "expired":
        return { error: "The response period has ended. This quotation is read-only." };
      default:
        return { error: "This quotation link is unavailable." };
    }
  } catch {
    return { error: "We could not record your response. Please try again." };
  }
}
