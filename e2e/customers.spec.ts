import { expect, test } from "@playwright/test";

async function createWorkspace(page: import("@playwright/test").Page, prefix: string) {
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
  return email;
}

test("customers are session protected and an authenticated owner can create, find, view and edit records", async ({
  page,
}) => {
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/login$/);
  const email = await createWorkspace(page, "customer-owner");
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers", exact: true })).toBeVisible();
  await expect(page.getByText("No customers yet")).toBeVisible();
  await page.getByRole("link", { name: "Add customer" }).click();
  await expect(page.getByRole("heading", { name: "Add customer" })).toBeVisible();

  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByText("Enter the customer name.")).toBeVisible();
  await expect(page.getByText("Select a state or territory.")).toBeVisible();

  await page.getByLabel("Customer name").fill("Northwind Parts");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByLabel("Yes", { exact: true }).check();
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByText("Enter the GSTIN.")).toBeVisible();
  await expect(page.getByLabel("Customer name")).toHaveValue("Northwind Parts");
  await expect(page.getByLabel("State or territory")).toHaveValue("29");
  await expect(page.getByLabel("Yes", { exact: true })).toBeChecked();

  await page.getByLabel("GSTIN").fill("27abcde1234f1z5");
  await page.getByLabel("Phone").fill("9876500000");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Address").fill("42 Market Road");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/i, {
    timeout: 20_000,
  });
  const customerUrl = page.url();
  await expect(page.getByRole("heading", { name: "Northwind Parts" })).toBeVisible();
  await expect(page.getByText("27ABCDE1234F1Z5")).toBeVisible();
  await expect(page.getByText(/GSTIN starts with 27/)).toBeVisible();

  await page.goto("/customers");
  const search = page.getByLabel("Search customers");
  await search.fill("Northwind");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/customers\?q=Northwind$/);
  await expect(page.getByRole("link", { name: /Northwind Parts/ })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Northwind Parts/ })).toBeVisible();
  await page.getByRole("link", { name: /Northwind Parts/ }).click();
  await expect(page).toHaveURL(customerUrl);
  await page.getByRole("link", { name: "Edit customer" }).click();
  await page.getByLabel("Customer name").fill("Northwind Parts Updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Northwind Parts Updated" }),
  ).toBeVisible();
});

test("changing a customer URL ID cannot expose another business record", async ({
  browser,
}) => {
  const pageA = await browser.newPage();
  await createWorkspace(pageA, "customer-a");
  await pageA.goto("/customers/new");
  await pageA.getByLabel("Customer name").fill("Private A Customer");
  await pageA.getByLabel("State or territory").selectOption("29");
  await pageA.getByRole("button", { name: "Create customer" }).click();
  await expect(pageA).toHaveURL(/\/customers\/[0-9a-f-]+$/i, {
    timeout: 20_000,
  });
  const privateUrl = pageA.url();

  const pageB = await browser.newPage();
  await createWorkspace(pageB, "customer-b");
  const response = await pageB.goto(privateUrl);
  expect(response?.status()).toBe(404);
  expect(await response?.text()).toContain(
    "This customer is unavailable in your business.",
  );
  expect(await response?.text()).not.toContain("Private A Customer");
  await expect(pageB.getByRole("heading", { name: "Private A Customer" })).toHaveCount(0);
  await pageA.close();
  await pageB.close();
});
