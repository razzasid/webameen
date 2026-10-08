import { type BrowserContext, expect, type Page, test } from "@playwright/test";

let ownerA: Page;
let ownerB: Page;
let contextA: BrowserContext;
let contextB: BrowserContext;
let catalogA: string;
let catalogB: string;
let productA: string;
let productB: string;
let serviceA: string;
let draftA: string;
let ownerEmail: string;

async function createWorkspace(page: Page, prefix: string) {
  const email = `${prefix.toLowerCase().replaceAll(" ", "-")}-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding\/business$/, { timeout: 20_000 });
  await page.getByLabel("Business name").fill(`${prefix} Business`);
  await page.getByLabel("Contact email").fill(email);
  await page.getByLabel("Contact phone").fill("9876543210");
  await page.getByLabel("Business address").fill("Private workspace address");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByLabel("No", { exact: true }).check();
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/catalog");
  const href = await page
    .getByRole("link", { name: "Open public catalog" })
    .getAttribute("href");
  expect(href).toMatch(/^\/c\/catalog-[0-9a-f-]+$/);
  return { email, href: href as string };
}

async function createItem(page: Page, name: string, published: boolean, service = false) {
  await page.goto("/catalog/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Description").fill(`Details about ${name}.`);
  if (service) await page.getByLabel("Service", { exact: true }).check();
  await page.getByLabel("Unit label").fill(service ? "hour" : "piece");
  await page.getByLabel("Default unit price (₹)").fill("1250.09");
  await page.getByLabel("Default GST category").selectOption("no_gst");
  await page.getByRole("button", { name: "Create item" }).click();
  await expect(page).toHaveURL(/\/catalog\/[0-9a-f-]+$/i, { timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: "Private draft", exact: true }),
  ).toBeVisible();
  const id = page.url().split("/").pop() as string;
  if (published) {
    await page.getByRole("button", { name: "Publish to public catalog" }).click();
    await expect(page.getByRole("heading", { name: "Published", exact: true })).toBeVisible(
      { timeout: 20_000 },
    );
  }
  return id;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  contextA = await browser.newContext();
  contextB = await browser.newContext();
  ownerA = await contextA.newPage();
  ownerB = await contextB.newPage();
  const workspaceA = await createWorkspace(ownerA, "Public A");
  catalogA = workspaceA.href;
  ownerEmail = workspaceA.email;
  productA = await createItem(ownerA, "A public product", true);
  serviceA = await createItem(ownerA, "A public service", true, true);
  draftA = await createItem(ownerA, "A private draft", false);
  catalogB = (await createWorkspace(ownerB, "Public B")).href;
  productB = await createItem(ownerB, "B public product", true);
});

test.afterAll(async () => {
  await contextA?.close();
  await contextB?.close();
});

test("unauthenticated customers can browse published products on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const response = await page.goto(catalogA);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(catalogA);
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Public A Business" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A public product", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A public service", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("A private draft", { exact: true })).toHaveCount(0);
  await expect(page.getByText("B public product", { exact: true })).toHaveCount(0);
  const html = await response?.text();
  expect(html).not.toContain(ownerEmail);
  expect(html).not.toContain("Private workspace address");
  await expect(page.getByRole("link", { name: "Edit item" })).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});

test("a guest can open product details and return to the catalog", async ({ page }) => {
  await page.goto(catalogA);
  await page.getByRole("link", { name: /A public product/ }).click();
  // Next dev compiles the detail route on its first visit; wait for that navigation.
  await expect(page).toHaveURL(`${catalogA}/${productA}`, { timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: "A public product", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Details about A public product.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("₹1,250.09", { exact: true })).toBeVisible();
  await expect(page.getByText("per piece", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All products & services" }).click();
  await expect(page).toHaveURL(catalogA);
});

test("private catalog management remains protected for guests", async ({ page }) => {
  for (const path of [
    "/catalog",
    "/catalog/new",
    `/catalog/${productA}`,
    `/catalog/${productA}/edit`,
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("public product details cannot mix one business slug with another business item", async ({
  page,
}) => {
  const response = await page.goto(`${catalogA}/${productB}`);
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Catalog or item unavailable" }),
  ).toBeVisible();
  expect(await response?.text()).not.toContain("B public product");
  await ownerB.goto(`${catalogB}/${productA}`);
  await expect(
    ownerB.getByRole("heading", { name: "Catalog or item unavailable" }),
  ).toBeVisible();
  await page.goto(`${catalogB}/${productB}`);
  await expect(
    page.getByRole("heading", { name: "B public product", exact: true }),
  ).toBeVisible();
});

test("invalid links and private drafts are unavailable without a login prompt", async ({
  page,
}) => {
  for (const path of [
    "/c/missing-business",
    "/c/INVALID!",
    `${catalogA}/${draftA}`,
    `${catalogA}/invalid-product`,
    `${catalogA}/00000000-0000-0000-0000-000000000000`,
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: "Catalog or item unavailable" }),
    ).toBeVisible();
    await expect(page).toHaveURL(path);
    expect(await response?.text()).not.toContain("A private draft");
  }
});

test("owner edits update public details, and unpublishing removes items from a stable URL", async ({
  page,
}) => {
  await ownerA.goto(`/catalog/${productA}/edit`);
  await ownerA.getByLabel("Description").fill("Updated public product description.");
  await expect(ownerA.getByLabel("Description")).toHaveValue(
    "Updated public product description.",
  );
  await ownerA.getByRole("button", { name: "Save changes" }).click();
  await expect(ownerA).toHaveURL(new RegExp(`/catalog/${productA}$`), { timeout: 20_000 });
  await page.goto(`${catalogA}/${productA}`);
  await expect(
    page.getByText("Updated public product description.", { exact: true }),
  ).toBeVisible();
  for (const id of [productA, serviceA]) {
    await ownerA.goto(`/catalog/${id}`);
    await ownerA.getByRole("button", { name: "Unpublish item" }).click();
    await expect(
      ownerA.getByRole("heading", { name: "Private draft", exact: true }),
    ).toBeVisible({ timeout: 20_000 });
  }
  const response = await page.goto(`${catalogA}/${productA}`);
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Catalog or item unavailable" }),
  ).toBeVisible();
  await page.goto(catalogA);
  await expect(page.getByRole("heading", { name: "No items available yet" })).toBeVisible();
  await ownerA.goto("/catalog");
  await ownerA.reload();
  await expect(ownerA.getByRole("link", { name: "Open public catalog" })).toHaveAttribute(
    "href",
    catalogA,
  );
});
