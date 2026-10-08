import { describe, expect, it } from "vitest";
import { catalogItemSchema, formatPaise, paiseToRupees, rupeesToPaise } from "./validation";

const valid = {
  kind: "product",
  name: "  Steel fastener  ",
  description: "",
  unitLabel: "custom bundle",
  defaultPrice: "1250.09",
  gstCategory: "no_gst",
  gstRate: "",
  hsnSac: "0101",
};

describe("catalog validation", () => {
  it("requires a name and accepts only supported kinds/categories", () => {
    expect(catalogItemSchema.safeParse({ ...valid, name: " " }).success).toBe(false);
    expect(catalogItemSchema.safeParse({ ...valid, kind: "bundle" }).success).toBe(false);
    expect(
      catalogItemSchema.safeParse({ ...valid, gstCategory: "zero_rated" }).success,
    ).toBe(false);
  });

  it("allows product and service, custom units, and optional HSN/SAC", () => {
    const parsed = catalogItemSchema.parse({ ...valid, kind: "service", hsnSac: "" });
    expect(parsed.kind).toBe("service");
    expect(parsed.unitLabel).toBe("custom bundle");
    expect(parsed.hsnSac).toBe("");
  });

  it("requires a selected rate only for taxable items", () => {
    expect(
      catalogItemSchema.safeParse({ ...valid, gstCategory: "taxable", gstRate: "" })
        .success,
    ).toBe(false);
    expect(
      catalogItemSchema.safeParse({ ...valid, gstCategory: "taxable", gstRate: "18" })
        .success,
    ).toBe(true);
    expect(
      catalogItemSchema.safeParse({ ...valid, gstCategory: "exempt", gstRate: "" }).success,
    ).toBe(true);
    expect(
      catalogItemSchema.safeParse({ ...valid, gstCategory: "no_gst", gstRate: "" }).success,
    ).toBe(true);
    expect(
      catalogItemSchema.safeParse({ ...valid, gstCategory: "exempt", gstRate: "18" })
        .success,
    ).toBe(false);
  });

  it("stores money as exact integer paise and formats it without floating point", () => {
    expect(rupeesToPaise("1250.09")).toBe("125009");
    expect(rupeesToPaise("0.1")).toBe("10");
    expect(rupeesToPaise("")).toBeNull();
    expect(paiseToRupees("9007199254740991")).toBe("90071992547409.91");
    expect(formatPaise("125009")).toBe("₹1,250.09");
    expect(() => rupeesToPaise("1.009")).toThrow();
    expect(() => rupeesToPaise("92233720368547758.08")).toThrow();
  });
});
