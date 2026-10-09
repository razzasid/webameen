import { describe, expect, it } from "vitest";
import { isUuid } from "./uuid";

describe("UUID path validation", () => {
  it("accepts canonical UUIDs regardless of hex letter case", () => {
    expect(isUuid("8f14e45f-ea2d-4f21-9f17-bc3b9f9a3d21")).toBe(true);
    expect(isUuid("8F14E45F-EA2D-4F21-9F17-BC3B9F9A3D21")).toBe(true);
  });

  it("rejects malformed UUID path segments", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("8f14e45f-ea2d-4f21-9f17-bc3b9f9a3d2z")).toBe(false);
    expect(isUuid("8f14e45f-ea2d-4f21-9f17-bc3b9f9a3d21/extra")).toBe(false);
    expect(isUuid("8f14e45fea2d4f219f17bc3b9f9a3d21")).toBe(false);
  });
});
