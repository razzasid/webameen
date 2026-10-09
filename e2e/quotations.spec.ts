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
  await expect(page).toHaveURL(/\/onboarding\/business$/);
  await page.getByLabel("Business name").fill(`${prefix} Business`);
  await page.getByLabel("Contact email").fill(email);
  await page.getByLabel("Contact phone").fill("9876543210");
  await page.getByLabel("Business address").fill("Seller address");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByLabel("No", { exact: true }).check();
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("owner creates, previews, saves and reopens an exact quotation draft", async ({
  page,
}) => {
  await page.goto("/quotations");
  await expect(page).toHaveURL(/\/login$/);
  await createWorkspace(page, "quote-owner");
  await page.goto("/customers/new");
  await page.getByLabel("Customer name").fill("Quotation Buyer");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/i, { timeout: 20_000 });

  await page.goto("/quotations/new");
  await page.getByLabel("Customer").selectOption({ label: "Quotation Buyer" });
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]+$/i, { timeout: 20_000 });
  const quoteUrl = page.url();
  await expect(page.getByLabel("Buyer name")).toHaveValue("Quotation Buyer");
  await page.getByLabel("Seller address").fill("Seller address");
  await page.getByLabel("Buyer billing address").fill("Buyer address");
  await page.getByLabel("Seller state").selectOption("29");
  await page.getByLabel("Buyer state").selectOption("29");
  await page.getByLabel("Seller GST registered?").selectOption("no");
  await page.getByLabel("Buyer GSTIN applicable?").selectOption("no");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Description").fill("Consulting service");
  await page.getByLabel("Unit", { exact: true }).fill("each");
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Unit price before GST (₹)").fill("10000.00");
  await page.getByLabel("GST rate").selectOption("18");
  await page.getByLabel("Place of supply applies?").selectOption("no");
  await page.getByLabel("Reverse charge applies?").selectOption("no");
  await page.getByLabel("Quantity").fill("1.2345");
  await page.getByRole("button", { name: "Preview calculation" }).click();
  await expect(page.locator("form [role='alert']")).toContainText("up to three decimals");
  await expect(page.getByLabel("Description")).toHaveValue("Consulting service");
  await page.getByLabel("Quantity").fill("1");
  await page.getByRole("button", { name: "Preview calculation" }).click();
  await expect(page.getByText("Calculated preview — not saved")).toBeVisible();
  await expect(page.getByText("₹11,800.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(`${quoteUrl}?saved=1`, { timeout: 20_000 });
  await expect(page.getByText("Draft saved.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Description")).toHaveValue("Consulting service");
  await expect(page.getByLabel("Unit price before GST (₹)")).toHaveValue("10000.00");
  await expect(page.getByText("Last saved totals")).toBeVisible();

  await page.goto("/catalog/new");
  await page.getByLabel("Name").fill("Copied support plan");
  await page.getByLabel("Unit label").fill("month");
  await page.getByLabel("Default unit price (₹)").fill("50.00");
  await page.getByLabel("Default GST category").selectOption("no_gst");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page).toHaveURL(/\/catalog\/[0-9a-f-]+$/i, { timeout: 20_000 });
  const catalogUrl = page.url();

  await page.goto(quoteUrl);
  await page.getByRole("button", { name: "Add line" }).click();
  const copiedLine = page.getByRole("group", { name: "Line 2" });
  await copiedLine
    .getByLabel("Copy catalog default")
    .selectOption({ label: "Copied support plan" });
  await expect(copiedLine.getByPlaceholder("each, hour, month…")).toHaveValue("month");
  await copiedLine.getByLabel("Description").fill("Custom support plan wording");
  await copiedLine.getByLabel("Unit price before GST (₹)").fill("75.00");
  const linesBeforeSecondSave = JSON.parse(
    await page.locator('input[name="linesJson"]').inputValue(),
  ) as Array<{ quantity: string }>;
  expect(linesBeforeSecondSave.map((line) => line.quantity)).toEqual(["1", "1"]);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(`${quoteUrl}?saved=1`, { timeout: 20_000 });
  await expect(page.getByText("₹11,875.00").first()).toBeVisible();

  await page.goto(catalogUrl);
  await page.getByRole("link", { name: "Edit item" }).click();
  await page.getByLabel("Name").fill("Changed master plan");
  await page.getByLabel("Default unit price (₹)").fill("999.00");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.goto(quoteUrl);
  await expect(
    page.getByRole("group", { name: "Line 2" }).getByLabel("Description"),
  ).toHaveValue("Custom support plan wording");
  await expect(
    page.getByRole("group", { name: "Line 2" }).getByLabel("Unit price before GST (₹)"),
  ).toHaveValue("75.00");
  await expect(page.getByText("₹11,875.00").first()).toBeVisible();

  const secondTab = await page.context().newPage();
  await secondTab.goto(quoteUrl);
  await page
    .getByRole("group", { name: "Line 1" })
    .getByLabel("Description")
    .fill("First edit");
  await secondTab
    .getByRole("group", { name: "Line 1" })
    .getByLabel("Description")
    .fill("Second edit");
  await Promise.all([
    page.getByRole("button", { name: "Save draft" }).click(),
    secondTab.getByRole("button", { name: "Save draft" }).click(),
  ]);
  await expect
    .poll(async () => {
      const saved =
        Number(page.url().endsWith("?saved=1")) +
        Number(secondTab.url().endsWith("?saved=1"));
      const conflict =
        (await page.getByRole("alert").filter({ hasText: "changed elsewhere" }).count()) +
        (await secondTab
          .getByRole("alert")
          .filter({ hasText: "changed elsewhere" })
          .count());
      return `${saved}:${conflict}`;
    })
    .toBe("1:1");
  await secondTab.close();
});

test("another owner cannot open a private quotation draft", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await createWorkspace(pageA, "quote-a");
    await pageA.goto("/customers/new");
    await pageA.getByLabel("Customer name").fill("Private Buyer");
    await pageA.getByLabel("State or territory").selectOption("29");
    await pageA.getByRole("button", { name: "Create customer" }).click();
    await expect(pageA).toHaveURL(/\/customers\/[0-9a-f-]+$/i, { timeout: 20_000 });
    await pageA.goto("/quotations/new");
    await pageA.getByLabel("Customer").selectOption({ label: "Private Buyer" });
    await pageA.getByRole("button", { name: "Create draft" }).click();
    await expect(pageA).toHaveURL(/\/quotations\/[0-9a-f-]+$/i, { timeout: 20_000 });
    const privateUrl = pageA.url();

    await createWorkspace(pageB, "quote-b");
    await pageB.goto(privateUrl);
    await expect(pageB.getByText("Quotation Buyer")).toHaveCount(0);
    await expect(pageB.getByLabel("Buyer name")).toHaveCount(0);
    await expect(
      pageB.getByRole("heading", { name: "That page is not here" }),
    ).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
