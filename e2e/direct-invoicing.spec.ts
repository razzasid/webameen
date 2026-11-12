import { expect, type Page, test } from "@playwright/test";

async function createWorkspace(page: Page) {
  const email = `direct-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/(?:dashboard|onboarding\/business)$/, {
    timeout: 30_000,
  });
  await page.goto("/onboarding/business");
  await page.getByLabel("Business name").fill("Direct Invoicing Ltd");
  await page.getByLabel("Contact email").fill(email);
  await page.getByLabel("Contact phone").fill("9876543210");
  await page.getByLabel("Business address").fill("123 Business Way, Bengaluru");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByLabel("No", { exact: true }).check();
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("direct invoice creation workflow end-to-end", async ({ page }) => {
  test.setTimeout(240_000);
  await createWorkspace(page);

  // 1. Configure numbering period
  await page.goto("/settings");
  await page.getByLabel("Period name").fill("FY26-27");
  await page.getByLabel("Prefix", { exact: true }).fill("INV");
  await page.getByLabel("Start date").fill("2020-01-01");
  await page.getByLabel("End date (excluded)").fill("2030-01-01");
  await page.getByLabel("Invoice number format").fill("{prefix}-{period}-{number}");
  await page.getByLabel("Minimum number digits").fill("3");
  await page.getByLabel("Starting number").fill("1");
  await page.getByRole("button", { name: "Save numbering period" }).click();
  await expect(page.getByText("Numbering period saved.")).toBeVisible();

  // 2. Create customer
  await page.goto("/customers/new");
  await page.getByLabel("Customer name").fill("Acme Corp Buyer");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByLabel("Address").fill("456 Client Road, Bengaluru");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/i, { timeout: 20_000 });

  // 3. Navigate to invoices page
  await page.goto("/invoices");
  await expect(page.getByRole("heading", { name: "Invoices", level: 1 })).toBeVisible();

  // 4. Click 'Create invoice'
  const createInvoiceBtn = page.getByRole("link", { name: "Create invoice" }).first();
  await expect(createInvoiceBtn).toBeVisible();
  await createInvoiceBtn.click();
  await expect(page).toHaveURL(/\/invoices\/new$/);

  // 5. Check direct invoice form is present
  await expect(
    page.getByRole("heading", { name: "Create invoice", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Direct Invoicing Ltd" })).toBeVisible();

  // 6. Fill line item
  await page
    .getByPlaceholder("Item name / description...")
    .fill("Cloud Consulting Services");
  await page.getByLabel("Line 1 Price in Rupees").fill("5000");

  // 7. Preview totals
  await page.getByRole("button", { name: "Preview totals" }).click();
  await expect(page.getByText("Server calculations verified")).toBeVisible();

  // 8. Submit invoice
  await page.getByRole("button", { name: "Create Invoice" }).click();

  // 9. Verify redirect to invoice detail page
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/i, { timeout: 30_000 });
  await expect(page.getByText("INV-FY26-27-001")).toBeVisible();
  await expect(page.getByText("Acme Corp Buyer")).toBeVisible();
  await expect(page.getByText("Cloud Consulting Services")).toBeVisible();
});
