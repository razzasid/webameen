import { expect, test } from "@playwright/test";

test("workspace navigation opens every foundation placeholder", async ({ page }) => {
  const email = `nav-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

  const destinations = [
    { label: "Customers", path: "/customers", heading: "Customers" },
    {
      label: "Products & services",
      path: "/products",
      heading: "Products & Services",
    },
    { label: "Quotations", path: "/quotations", heading: "Quotations" },
    { label: "Invoices", path: "/invoices", heading: "Invoices" },
    { label: "Payments", path: "/payments", heading: "Payments" },
    { label: "Settings", path: "/settings", heading: "Settings" },
    { label: "Dashboard", path: "/dashboard", heading: "Dashboard" },
  ];

  for (const destination of destinations) {
    await page.getByRole("link", { name: destination.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: destination.heading }),
    ).toBeVisible();
  }
});

test("unauthenticated workspace access redirects and auth pages link to each other", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.getByRole("link", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("login errors are safe and logout invalidates the current session", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("unknown-user@example.com");
  await page.getByLabel("Password").fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  const loginError = page.locator('p[role="alert"]');
  await expect(loginError).toContainText("couldn't sign you in");
  await expect(loginError).not.toContainText("database");

  const email = `login-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
});
