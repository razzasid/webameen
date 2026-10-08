import { expect, type Page, test } from "@playwright/test";

async function createWorkspace(page: Page, prefix: string) {
  const email = `${prefix}-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Create account" }).click();
  // Account creation and the dashboard-to-onboarding redirect can exceed 5s in dev.
  await expect(page).toHaveURL(/\/onboarding\/business$/, { timeout: 20_000 });
  await page.getByLabel("Business name").fill(`${prefix} Business`);
  await page.getByLabel("Contact email").fill(email);
  await page.getByLabel("Contact phone").fill("9876543210");
  await page.getByLabel("Business address").fill("Test address");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByLabel("No", { exact: true }).check();
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("catalog is protected and an owner can create, search, view, and edit an item", async ({
  page,
}) => {
  await page.goto("/catalog");
  await expect(page).toHaveURL(/\/login$/);
  await createWorkspace(page, "catalog-owner");

  await page.goto("/catalog");
  await expect(page.getByRole("heading", { name: "Products & services" })).toBeVisible();
  await expect(page.getByText("Your catalog is empty")).toBeVisible();
  await page.getByRole("link", { name: "Add item" }).click();
  await expect(page.getByRole("heading", { name: "Add catalog item" })).toBeVisible();

  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page.getByText("Enter an item name.")).toBeVisible();
  await expect(page.getByText("Select a configured GST rate.")).toBeVisible();

  await page.getByLabel("Name").fill("Monthly bookkeeping");
  await page.getByLabel("Service", { exact: true }).check();
  await page.getByLabel("Unit label").fill("custom retainer");
  await page.getByLabel("Default unit price (₹)").fill("1250.09");
  await page.getByLabel("HSN / SAC").fill("998221");
  await page.getByLabel("Default GST category").selectOption("no_gst");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page).toHaveURL(/\/catalog\/[0-9a-f-]+$/i, { timeout: 20_000 });
  const itemUrl = page.url();
  await expect(page.getByRole("heading", { name: "Monthly bookkeeping" })).toBeVisible();
  await expect(page.getByText("Service", { exact: true })).toBeVisible();
  await expect(page.getByText("₹1,250.09")).toBeVisible();
  await expect(page.getByText("custom retainer")).toBeVisible();
  await expect(page.getByText("998221")).toBeVisible();

  await page.goto("/catalog");
  await page.getByLabel("Search catalog").fill("bookkeeping");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/catalog\?q=bookkeeping$/);
  await page.getByRole("link", { name: /Monthly bookkeeping/ }).click();
  await expect(page).toHaveURL(itemUrl);
  await page.getByRole("link", { name: "Edit item" }).click();
  await page.getByLabel("Name").fill("Monthly bookkeeping updated");
  await page.getByLabel("Default unit price (₹)").fill("2000.01");
  await page.getByLabel("HSN / SAC").fill("998222");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Monthly bookkeeping updated" }),
  ).toBeVisible();
  await expect(page.getByText("₹2,000.01")).toBeVisible();
  await expect(page.getByText("998222")).toBeVisible();
});

test("changing an item URL cannot expose another business catalog item", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await createWorkspace(pageA, "catalog-a");
  await pageA.goto("/catalog/new");
  await pageA.getByLabel("Name").fill("Private A service");
  await pageA.getByLabel("Default GST category").selectOption("exempt");
  await pageA.getByRole("button", { name: "Create item" }).click();
  await expect(pageA).toHaveURL(/\/catalog\/[0-9a-f-]+$/i, { timeout: 20_000 });
  const privateUrl = pageA.url();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await createWorkspace(pageB, "catalog-b");
  await expect(pageB.getByRole("banner").getByText("catalog-b Business")).toBeVisible();
  await pageB.goto(privateUrl);
  await expect(pageB.getByRole("heading", { name: "Private A service" })).toHaveCount(0);
  await pageA.close();
  await pageB.close();
  await contextA.close();
  await contextB.close();
});
