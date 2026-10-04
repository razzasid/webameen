import { expect, test } from "@playwright/test";

test("workspace navigation opens every foundation placeholder", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);

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

test("login and signup pages link to each other", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByRole("link", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
