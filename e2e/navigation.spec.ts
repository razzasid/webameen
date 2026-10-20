import { expect, test } from "@playwright/test";

test("workspace navigation opens the catalog alongside existing workspace pages", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const email = `nav-${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Create account" }).click();
  // Account creation and the dashboard-to-onboarding redirect can exceed 5s in dev.
  await expect(page).toHaveURL(/\/onboarding\/business$/, { timeout: 20_000 });
  await page.getByLabel("Business name").fill("Navigation Test Business");
  await page.getByLabel("Contact email").fill(email);
  await page.getByLabel("Contact phone").fill("9876543210");
  await page.getByLabel("Business address").fill("Test address, Bengaluru");
  await page.getByLabel("State or territory").selectOption("29");
  await page.getByLabel("No", { exact: true }).check();
  await page.getByRole("button", { name: "Create business" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  const destinations = [
    { label: "Customers", path: "/customers", heading: "Customers" },
    {
      label: "Products & services",
      path: "/catalog",
      heading: "Products & services",
    },
    { label: "Quotations", path: "/quotations", heading: "Quotations" },
    { label: "Invoices", path: "/invoices", heading: "Invoices" },
    { label: "Payments", path: "/payments", heading: "Payments" },
    { label: "Settings", path: "/settings", heading: "Settings" },
    { label: "Dashboard", path: "/dashboard", heading: "Navigation Test Business" },
  ];

  for (const destination of destinations) {
    await page.getByRole("link", { name: destination.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: destination.heading }),
    ).toBeVisible();
  }

  const responsiveRoutes = [
    "/customers",
    "/customers/new",
    "/catalog",
    "/catalog/new",
    "/products",
    "/quotations",
    "/quotations/new",
    "/invoices",
    "/payments",
    "/settings",
  ];
  const viewportWidths = [320, 375, 390, 430, 768, 1024, 1280, 1440];
  await page.goto("/dashboard");
  for (const width of viewportWidths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("main")).toBeVisible();
    if (width < 768) {
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "More navigation options" }).click();
      await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
    } else {
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    }
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow, `dashboard overflows at ${width}px`).toBe(false);
  }

  for (const path of responsiveRoutes) {
    await page.goto(path);
    if (path === "/products") await expect(page).toHaveURL(/\/catalog$/);
    await expect(page.getByRole("main")).toBeVisible();
    for (const width of viewportWidths) {
      await page.setViewportSize({ width, height: 900 });
      const routeHasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(routeHasHorizontalOverflow, `${path} overflows at ${width}px`).toBe(false);
    }
  }
});

test("unauthenticated workspace access redirects and auth pages link to each other", async ({
  page,
}) => {
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: "ready", databaseConfigured: true });

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

test("password recovery callback handles expired links and unauthenticated resets safely", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Resend confirmation" })).toBeVisible();

  await page.goto("/auth/callback?code=expired&next=%2Freset-password");
  await expect(page).toHaveURL(/\/reset-password\?error=link$/);
  await expect(page.locator('p[role="alert"]')).toContainText("invalid or expired");

  await page.getByLabel("New password").fill("Valid-Reset-Password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.locator('p[role="alert"]').last()).toContainText("invalid or expired");

  await page.goto("/auth/callback?code=expired&next=https%3A%2F%2Fevil.example");
  await expect(page).toHaveURL(/\/login\?error=confirmation$/);
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
  await expect(page).toHaveURL(/\/onboarding\/business$/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("Webameen-Test-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/onboarding\/business$/);
  await expect(page.getByRole("heading", { name: "Set up your business" })).toBeVisible();
});
