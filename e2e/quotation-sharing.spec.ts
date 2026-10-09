import { expect, type Page, test } from "@playwright/test";

async function createWorkspace(page: Page, prefix: string) {
  const email = `${prefix}-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/(?:dashboard|onboarding\/business)$/, {
    timeout: 30_000,
  });
  await page.goto("/onboarding/business");
  await page.getByLabel("Business name").fill(`${prefix} Business`);
  await page.getByLabel("Contact email").fill(email);
  await page.getByLabel("Contact phone").fill("9876543210");
  await page.getByLabel("Business address").fill("Seller address");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByLabel("No", { exact: true }).check();
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("guest reads the shared frozen quote, then revision sharing revokes the old link", async ({
  page,
}) => {
  await createWorkspace(page, "quote-share");
  await page.goto("/customers/new");
  await page.getByLabel("Customer name").fill("Quotation Guest");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByRole("button", { name: "Create customer" }).click();

  await page.goto("/quotations/new");
  await page.getByLabel("Customer").selectOption({ label: "Quotation Guest" });
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]+$/i, { timeout: 20_000 });
  const quoteUrl = page.url();
  await page.getByLabel("Seller address").fill("Seller address");
  await page.getByLabel("Buyer billing address").fill("Buyer address");
  await page.getByLabel("Seller state").selectOption("29");
  await page.getByLabel("Buyer state").selectOption("29");
  await page.getByLabel("Seller GST registered?").selectOption("no");
  await page.getByLabel("Buyer GSTIN applicable?").selectOption("no");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Description").fill("Accountless customer consultation");
  await page.getByLabel("Unit", { exact: true }).fill("hour");
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Unit price before GST (₹)").fill("100.00");
  await page.getByLabel("GST rate").selectOption("18");
  await page.getByLabel("Place of supply applies?").selectOption("no");
  await page.getByLabel("Reverse charge applies?").selectOption("no");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(`${quoteUrl}?saved=1`, { timeout: 20_000 });

  await page.getByRole("button", { name: "Share quotation" }).click();
  const linkField = page.getByRole("textbox", { name: "Quotation link" });
  await expect(linkField).toHaveValue(/^http/, { timeout: 20_000 });
  const oldLink = await linkField.inputValue();
  await page.goto(oldLink);
  await expect(page.getByText("Accountless customer consultation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve quotation" })).toBeVisible();

  await page.goto(quoteUrl);
  await page.getByRole("button", { name: "Create revision" }).click();
  await expect(page).toHaveURL(/\?revision=[0-9a-f-]+$/i, { timeout: 20_000 });
  await expect(page.getByLabel("Description")).toHaveValue(
    "Accountless customer consultation",
  );
  await page.getByRole("button", { name: "Share quotation" }).click();
  const replacementField = page.getByRole("textbox", { name: "Quotation link" });
  await expect(replacementField).toHaveValue(/^http/, { timeout: 20_000 });
  const replacementLink = await replacementField.inputValue();

  await page.goto(oldLink);
  await expect(page.getByRole("heading", { name: "That page is not here" })).toBeVisible();
  await page.goto(replacementLink);
  await expect(page.getByText("Accountless customer consultation")).toBeVisible();
  await expect(page.getByText("Version 2")).toBeVisible();
});
