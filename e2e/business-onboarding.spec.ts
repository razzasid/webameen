import { expect, test } from "@playwright/test";

test("onboarding needs a session, and a new owner is sent to setup", async ({ page }) => {
  await page.goto("/onboarding/business");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/signup");
  const email = `business-${Date.now()}@example.com`;
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Create account" }).click();
  // Account creation and the dashboard-to-onboarding redirect can exceed 5s in dev.
  await expect(page).toHaveURL(/\/onboarding\/business$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Set up your business" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/onboarding\/business$/);

  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page.getByText("Enter the business name.")).toBeVisible();
  await expect(
    page.getByText("Select whether the business is GST registered."),
  ).toBeVisible();

  await page.getByLabel("Business name").fill("Webameen Test Shop");
  await page.getByLabel("Contact email").fill(email);
  await page.getByLabel("Contact phone").fill("9876543210");
  await page.getByLabel("Business address").fill("123 Test Road, Bengaluru");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByLabel("Yes", { exact: true }).check();
  await expect(page.getByLabel("State or territory")).toHaveValue("29");
  await expect(page.getByLabel("Yes", { exact: true })).toBeChecked();
  await expect(page.getByLabel("GSTIN")).toBeVisible();
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page.getByText("Enter the GSTIN.")).toBeVisible();
  await expect(page.getByLabel("State or territory")).toHaveValue("29");

  await page.getByLabel("GSTIN").fill("27abcde1234f1z5");
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome to Webameen" })).toBeVisible();
  await expect(page.getByText("Business: Webameen Test Shop")).toBeVisible();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await expect(page.getByText(/GSTIN starts with 27/)).toBeVisible();

  await page.goto("/onboarding/business");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page.getByText("Business: Webameen Test Shop")).toBeVisible();
});
