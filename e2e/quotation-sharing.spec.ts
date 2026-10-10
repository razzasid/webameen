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
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/i, { timeout: 20_000 });

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
  const browser = page.context().browser();
  if (!browser) throw new Error("Playwright browser is unavailable");
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  const publicResponse = await guestPage.goto(oldLink);
  expect(publicResponse?.headers()["cache-control"]).toContain("no-store");
  expect(publicResponse?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(guestPage.getByText("Accountless customer consultation")).toBeVisible();
  await expect(guestPage.getByRole("button", { name: "Approve quotation" })).toBeVisible();

  const secondGuestPage = await guestContext.newPage();
  await secondGuestPage.goto(oldLink);
  await page.goto(quoteUrl);
  await expect(page.getByRole("button", { name: "Create revision" })).toBeVisible();
  await Promise.all([
    guestPage.getByLabel("Your name (optional)").fill("First customer"),
    guestPage.getByLabel("Note (optional)").fill("Approved from the first page"),
    secondGuestPage.getByLabel("Your name (optional)").fill("Second customer"),
    secondGuestPage
      .getByLabel("Note (optional)")
      .fill("Please revise from the second page"),
  ]);
  await Promise.all([
    guestPage.getByRole("button", { name: "Approve quotation" }).click(),
    secondGuestPage.getByRole("button", { name: "Request changes" }).click(),
    page.getByRole("button", { name: "Create revision" }).click(),
  ]);
  const readResponseResults = () =>
    Promise.all(
      [guestPage, secondGuestPage].map(async (customerPage) => ({
        recorded: await customerPage
          .getByRole("status")
          .filter({ hasText: "Your response has been recorded." })
          .count(),
        conflict: await customerPage
          .getByRole("alert")
          .filter({ hasText: "A response has already been recorded for this version." })
          .count(),
        unavailable: await customerPage
          .getByRole("alert")
          .filter({ hasText: "This quotation link is unavailable." })
          .count(),
      })),
    );
  await expect
    .poll(async () =>
      (await readResponseResults()).reduce(
        (count, result) => count + result.recorded + result.conflict + result.unavailable,
        0,
      ),
    )
    .toBe(2);
  const responseResults = await readResponseResults();
  const recordedResponses = responseResults.reduce(
    (count, result) => count + result.recorded,
    0,
  );
  expect(recordedResponses).toBeLessThanOrEqual(1);
  expect(
    responseResults.reduce(
      (count, result) => count + result.recorded + result.conflict + result.unavailable,
      0,
    ),
  ).toBe(2);
  await secondGuestPage.close();
  await expect(page).toHaveURL(/\?revision=[0-9a-f-]+$/i, { timeout: 20_000 });
  await guestPage.reload();
  await expect(guestPage.getByRole("status")).toContainText(
    "The business is preparing a revised quotation.",
  );
  await expect(guestPage.getByRole("button", { name: "Approve quotation" })).toHaveCount(0);
  await expect(page.getByLabel("Description")).toHaveValue(
    "Accountless customer consultation",
  );
  await page.getByRole("button", { name: "Share quotation" }).click();
  const replacementField = page.getByRole("textbox", { name: "Quotation link" });
  await expect(replacementField).toHaveValue(/^http/, { timeout: 20_000 });
  const replacementLink = await replacementField.inputValue();

  await guestPage.goto(oldLink);
  await expect(
    guestPage.getByRole("heading", { name: "That page is not here" }),
  ).toBeVisible();
  await guestPage.goto(replacementLink);
  await expect(guestPage.getByText("Accountless customer consultation")).toBeVisible();
  await expect(guestPage.getByText("Version 2")).toBeVisible();
  await page.goto(quoteUrl);

  await guestPage.getByLabel("Note (optional)").fill("Please confirm the revised timing.");
  await Promise.all([
    guestPage.getByRole("button", { name: "Request changes" }).click(),
    page.getByRole("button", { name: "Revoke" }).click(),
  ]);
  const changeRequestRecorded = guestPage
    .getByRole("status")
    .filter({ hasText: "Your response has been recorded." });
  const revokedBeforeResponse = guestPage
    .getByRole("alert")
    .filter({ hasText: "This quotation link is unavailable." });
  await expect
    .poll(
      async () =>
        (await changeRequestRecorded.count()) + (await revokedBeforeResponse.count()),
    )
    .toBe(1);
  await expect(page.getByRole("status")).toContainText(
    "The quotation link has been revoked.",
  );

  if (await revokedBeforeResponse.count()) {
    await page.goto(quoteUrl);
    await page.getByRole("button", { name: "Create replacement link" }).click();
    const renewedLink = page.getByRole("textbox", { name: "Quotation link" });
    await expect(renewedLink).toHaveValue(/^http/, { timeout: 20_000 });
    await guestPage.goto(await renewedLink.inputValue());
    await guestPage
      .getByLabel("Note (optional)")
      .fill("Please confirm the revised timing.");
    await guestPage.getByRole("button", { name: "Request changes" }).click();
    await expect(guestPage.getByRole("status")).toContainText(
      "Your response has been recorded.",
    );
  } else {
    await guestPage.goto(replacementLink);
    await expect(
      guestPage.getByRole("heading", { name: "That page is not here" }),
    ).toBeVisible();
  }
  await page.goto(quoteUrl);
  await expect(
    page.getByText("Customer change requested", { exact: true }).first(),
  ).toBeVisible();
  await guestContext.close();
});
