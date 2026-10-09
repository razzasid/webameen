import { expect, type Page, test } from "@playwright/test";

async function createWorkspace(page: Page, prefix: string) {
  const email = `${prefix}-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Create account" }).click();
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

test("business settings save, reload and recover from field errors", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
  await createWorkspace(page, "settings-owner");
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Business document setup" }),
  ).toBeVisible();
  await expect(page.getByText("Country: India · Currency: INR")).toBeVisible();

  await page.getByLabel("Business name").fill("");
  await page.getByLabel("Contact email").fill("bad-email");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Enter the business name.")).toBeVisible();
  await expect(page.getByText("Enter a valid contact email.")).toBeVisible();
  await page.getByLabel("Business name").fill("Updated Settings Shop");
  await expect(page.getByText("Enter the business name.")).toHaveCount(0);
  await expect(page.getByText("Enter a valid contact email.")).toBeVisible();
  await page.getByLabel("Contact email").fill("settings@example.com");
  await page.getByLabel("Bank name").fill("Test Bank");
  await page.getByLabel("Default terms").fill("Due when agreed");
  await page.getByLabel("Document time zone").fill("Not/A_Zone");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/^Review the settings,/)).toBeVisible();
  await expect(page.getByLabel("Bank name")).toHaveValue("Test Bank");
  await page.getByLabel("Document time zone").fill("Asia/Kolkata");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Business settings saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Business name")).toHaveValue("Updated Settings Shop");
  await expect(page.getByLabel("Bank name")).toHaveValue("Test Bank");
  await expect(page.getByLabel("Default terms")).toHaveValue("Due when agreed");
});

test("one owner cannot see another owner's private settings", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await createWorkspace(pageA, "settings-a");
    await pageA.goto("/settings");
    await pageA.getByLabel("Bank account number").fill("PRIVATE-ACCOUNT-A");
    await pageA.getByRole("button", { name: "Save settings" }).click();
    await expect(pageA.getByText("Business settings saved.")).toBeVisible();

    await createWorkspace(pageB, "settings-b");
    await pageB.goto("/settings");
    await expect(pageB.getByLabel("Bank account number")).toHaveValue("");
    await expect(pageB.getByLabel("Business name")).toHaveValue("settings-b Business");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
