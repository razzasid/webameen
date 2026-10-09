import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getBusinessContext } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getBusinessContext: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/server/modules/business/context", () => ({ getBusinessContext }));

import { getCatalogItem } from "./queries";

describe("getCatalogItem route ID handling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the normal not-found path before resolving business or database data", async () => {
    await expect(getCatalogItem("bad-id")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getBusinessContext).not.toHaveBeenCalled();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
