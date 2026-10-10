import { expect, type Page, test } from "@playwright/test";

async function createWorkspace(page: Page) {
  const email = `invoice-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/(?:dashboard|onboarding\/business)$/, {
    timeout: 30_000,
  });
  await page.goto("/onboarding/business");
  await page.getByLabel("Business name").fill("Invoice Demo Business");
  await page.getByLabel("Contact email").fill(email);
  await page.getByLabel("Contact phone").fill("9876543210");
  await page.getByLabel("Business address").fill("Seller address");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByLabel("No", { exact: true }).check();
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("approved quotations allocate concurrent numbers and reopen the same snapshots", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await createWorkspace(page);
  await page.goto("/settings");
  await page.getByLabel("Period name").fill("FY-DEMO");
  await page.getByLabel("Prefix", { exact: true }).fill("WEB");
  await page.getByLabel("Start date").fill("2000-01-01");
  await page.getByLabel("End date (excluded)").fill("2100-01-01");
  await page.getByLabel("Invoice number format").fill("{prefix}/{period}/{number}");
  await page.getByLabel("Minimum number digits").fill("4");
  await page.getByLabel("Starting number").fill("100");
  await page.getByRole("button", { name: "Save numbering period" }).click();
  await expect(page.getByText("Numbering period saved.")).toBeVisible();

  await page.goto("/customers/new");
  await page.getByLabel("Customer name").fill("Invoice Demo Buyer");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/i, { timeout: 20_000 });

  await page.goto("/quotations/new");
  await page.getByLabel("Customer").selectOption({ label: "Invoice Demo Buyer" });
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]+$/i, { timeout: 20_000 });
  const quotationUrl = page.url();
  await page.getByLabel("Seller address").fill("Seller address");
  await page.getByLabel("Buyer billing address").fill("Buyer address");
  await page.getByLabel("Seller state").selectOption("29");
  await page.getByLabel("Buyer state").selectOption("29");
  await page.getByLabel("Seller GST registered?").selectOption("no");
  await page.getByLabel("Buyer GSTIN applicable?").selectOption("no");
  await page.getByRole("button", { name: "Add line" }).click();
  await page.getByLabel("Description").fill("Approved project service");
  await page.getByLabel("Unit", { exact: true }).fill("day");
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Unit price before GST (₹)").fill("100.00");
  await page.getByLabel("GST rate").selectOption("18");
  await page.getByLabel("Place of supply applies?").selectOption("no");
  await page.getByLabel("Reverse charge applies?").selectOption("no");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(`${quotationUrl}?saved=1`, { timeout: 20_000 });
  await page.getByRole("button", { name: "Share quotation" }).click();
  const linkField = page.getByRole("textbox", { name: "Quotation link" });
  await expect(linkField).toHaveValue(/^http/, { timeout: 20_000 });

  const guestContext = await browser.newContext();
  let secondOwnerPage: Page | undefined;
  const openedContexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  try {
    const guestPage = await guestContext.newPage();
    await guestPage.goto(await linkField.inputValue());
    await guestPage.getByLabel("Your name (optional)").fill("Invoice Demo Buyer");
    await guestPage.getByRole("button", { name: "Approve quotation" }).click();
    await expect(guestPage.getByRole("status")).toContainText(
      "Your response has been recorded.",
    );

    await page.goto("/quotations/new");
    await page.getByLabel("Customer").selectOption({ label: "Invoice Demo Buyer" });
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]+$/i, { timeout: 20_000 });
    const secondQuotationUrl = page.url();
    await page.getByLabel("Seller address").fill("Seller address");
    await page.getByLabel("Buyer billing address").fill("Buyer address");
    await page.getByLabel("Seller state").selectOption("29");
    await page.getByLabel("Buyer state").selectOption("29");
    await page.getByLabel("Seller GST registered?").selectOption("no");
    await page.getByLabel("Buyer GSTIN applicable?").selectOption("no");
    await page.getByRole("button", { name: "Add line" }).click();
    await page.getByLabel("Description").fill("Second approved project service");
    await page.getByLabel("Unit", { exact: true }).fill("day");
    await page.getByLabel("Quantity").fill("2");
    await page.getByLabel("Unit price before GST (₹)").fill("75.00");
    await page.getByLabel("GST rate").selectOption("18");
    await page.getByLabel("Place of supply applies?").selectOption("no");
    await page.getByLabel("Reverse charge applies?").selectOption("no");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(`${secondQuotationUrl}?saved=1`, { timeout: 20_000 });
    await page.getByRole("button", { name: "Share quotation" }).click();
    const secondLinkField = page.getByRole("textbox", { name: "Quotation link" });
    await expect(secondLinkField).toHaveValue(/^http/, { timeout: 20_000 });
    const secondGuestPage = await guestContext.newPage();
    await secondGuestPage.goto(await secondLinkField.inputValue());
    await secondGuestPage.getByRole("button", { name: "Approve quotation" }).click();
    await expect(secondGuestPage.getByRole("status")).toContainText(
      "Your response has been recorded.",
    );

    secondOwnerPage = await page.context().newPage();
    await page.goto(quotationUrl);
    await secondOwnerPage.goto(secondQuotationUrl);
    await expect(page.getByText("✓ Current version", { exact: false })).toBeVisible();
    await expect(
      secondOwnerPage.getByText("✓ Current version", { exact: false }),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: /I reviewed the approved quotation/ }).check();
    await secondOwnerPage
      .getByRole("checkbox", { name: /I reviewed the approved quotation/ })
      .check();
    await Promise.all([
      page.getByRole("button", { name: "Issue invoice" }).click(),
      secondOwnerPage.getByRole("button", { name: "Issue invoice" }).click(),
    ]);
    await Promise.all([
      page.getByRole("link", { name: /Open (issued )?invoice/ }).click(),
      secondOwnerPage.getByRole("link", { name: /Open (issued )?invoice/ }).click(),
    ]);
    await expect(
      page.getByRole("heading", { name: /^WEB\/FY-DEMO\/010[01]$/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      secondOwnerPage.getByRole("heading", { name: /^WEB\/FY-DEMO\/010[01]$/ }),
    ).toBeVisible({ timeout: 20_000 });
    const issuedReferences = [
      await page.getByRole("heading", { level: 1 }).innerText(),
      await secondOwnerPage.getByRole("heading", { level: 1 }).innerText(),
    ].sort();
    expect(issuedReferences).toEqual(["WEB/FY-DEMO/0100", "WEB/FY-DEMO/0101"]);
    const mainInvoiceReference = await page.getByRole("heading", { level: 1 }).innerText();
    await expect(page.getByText("Approved project service")).toBeVisible();
    const invoiceUrl = page.url();
    await page.reload();
    await expect(page.getByRole("heading", { name: mainInvoiceReference })).toBeVisible();
    await page.goto(quotationUrl);
    await expect(page.getByRole("status")).toContainText("has been issued and is locked");
    await expect(page.getByRole("link", { name: "Open issued invoice" })).toHaveAttribute(
      "href",
      new URL(invoiceUrl).pathname,
    );

    const invoicePeer = secondOwnerPage;
    if (!invoicePeer) throw new Error("The second invoice tab is unavailable.");
    await Promise.all([page.goto(invoiceUrl), invoicePeer.goto(invoiceUrl)]);
    await page.getByLabel("Amount received (₹)").fill("70.00");
    await invoicePeer.getByLabel("Amount received (₹)").fill("70.00");
    await page.getByLabel("Payment method").fill("UPI");
    await invoicePeer.getByLabel("Payment method").fill("UPI");
    await Promise.all([
      page.getByRole("button", { name: "Record payment", exact: true }).click(),
      invoicePeer.getByRole("button", { name: "Record payment", exact: true }).click(),
    ]);
    await expect
      .poll(
        () =>
          [page.url(), invoicePeer.url()].filter((url) => url.includes("/receipts/"))
            .length,
        { timeout: 30_000 },
      )
      .toBe(1);
    const receiptPage = page.url().includes("/receipts/") ? page : invoicePeer;
    const invoicePage = receiptPage === page ? invoicePeer : page;
    const blockedPage = invoicePage;
    const partialReceiptUrl = receiptPage.url();
    const partialReceiptReference = await receiptPage
      .getByRole("heading", { level: 1 })
      .innerText();
    await expect(receiptPage.getByText("₹70.00", { exact: true })).toBeVisible();
    await expect(
      receiptPage.getByRole("button", { name: "Print or save receipt" }),
    ).toBeVisible();
    await expect(
      blockedPage.getByText("The payment no longer fits", { exact: false }),
    ).toBeVisible();
    await receiptPage.getByRole("link", { name: "Payments", exact: true }).click();
    await expect(
      receiptPage.getByRole("heading", { name: "Payments", exact: true }),
    ).toBeVisible();
    await expect(
      receiptPage.getByRole("link", { name: partialReceiptReference, exact: true }),
    ).toBeVisible();

    await invoicePage.goto(invoiceUrl);
    await expect(invoicePage.getByText("₹48.00", { exact: true })).toBeVisible();
    await invoicePage.getByLabel("Amount received (₹)").fill("48.00");
    await invoicePage.getByLabel("Payment method").fill("Bank transfer");
    await invoicePage.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(invoicePage).toHaveURL(/\/receipts\/[0-9a-f-]+$/i);
    await expect(invoicePage.getByText("₹48.00", { exact: true })).toBeVisible();

    await invoicePage.goto(invoiceUrl);
    const firstPayment = invoicePage.locator("li").filter({
      has: invoicePage.getByRole("link", { name: partialReceiptReference, exact: true }),
    });
    await firstPayment
      .getByLabel("Correction reason")
      .fill("Payment entered against the wrong details");
    await firstPayment.getByRole("button", { name: "Reverse payment" }).click();
    await expect(invoicePage).toHaveURL(/\?paymentUpdated=1$/);
    await expect(firstPayment.getByText("Reversed · receipt void")).toBeVisible();
    await expect(invoicePage.getByText("₹70.00", { exact: true })).toBeVisible();
    await expect(invoicePage.getByText("₹48.00", { exact: true })).toBeVisible();

    await firstPayment.getByLabel("Amount received (₹)").fill("70.00");
    await firstPayment.getByLabel("Payment method").fill("UPI");
    await firstPayment.getByRole("button", { name: "Record replacement payment" }).click();
    await expect(invoicePage).toHaveURL(/\/receipts\/[0-9a-f-]+$/i);
    const replacementReceiptReference = await invoicePage
      .getByRole("heading", { level: 1 })
      .innerText();
    await expect(
      invoicePage.getByRole("link", { name: `Replaces ${partialReceiptReference}` }),
    ).toBeVisible();
    await invoicePage.goto(invoiceUrl);
    await expect(
      invoicePage.getByRole("heading", { name: "paid", exact: true }),
    ).toBeVisible();
    await expect(invoicePage.getByText("₹0.00", { exact: true }).first()).toBeVisible();

    await invoicePage.goto(partialReceiptUrl);
    await expect(invoicePage.getByText("Void receipt", { exact: true })).toBeVisible();
    await expect(
      invoicePage.getByRole("link", { name: `Replaced by ${replacementReceiptReference}` }),
    ).toBeVisible();

    const foreignContext = await browser.newContext();
    openedContexts.push(foreignContext);
    const foreignPage = await foreignContext.newPage();
    await createWorkspace(foreignPage);
    const foreignInvoiceResponse = await foreignPage.goto(invoiceUrl);
    expect(foreignInvoiceResponse?.status()).toBe(404);
    const foreignReceiptResponse = await foreignPage.goto(partialReceiptUrl);
    expect(foreignReceiptResponse?.status()).toBe(404);
  } finally {
    await Promise.all(openedContexts.map((context) => context.close()));
    await secondOwnerPage?.close();
    await guestContext.close();
  }
});
