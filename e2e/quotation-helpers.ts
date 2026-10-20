import { expect, type Page } from "@playwright/test";

/** Start the full editor without persisting a draft until Save draft is clicked. */
export async function startQuotation(page: Page, buyer: string) {
  await page.goto("/quotations/new");
  await expect(
    page.getByRole("heading", { name: "New quotation", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Valid through")).not.toBeVisible();
  await expect(page.getByLabel("Place of supply applies?")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Item Description" })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Customer linked to this quotation draft" })
    .selectOption({ label: buyer });
  await expect(page.getByLabel("Description for line 1", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Description for line 2", { exact: true })).toHaveCount(0);
  const requestKey = await page.locator('input[name="requestKey"]').inputValue();
  await page.getByRole("button", { name: "Edit buyer details" }).click();
  await expect(
    page
      .locator("#quotation-draft-form")
      .getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled();
  return new URL(`/quotations/${requestKey}`, page.url()).toString();
}

export async function applyBuyerAndOpenTax(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Tax (optional)" }).click();
}
