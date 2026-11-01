import { test, expect } from "@playwright/test";

test("landing page renders and has no JavaScript runtime errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/index.html");
  await expect(page).toHaveTitle(/Scan It/i);
  await expect(page.locator("a[href='staff.html']")).toBeVisible();
  expect(errors).toEqual([]);
});

test("order form renders without unsafe navigation URLs", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/order.html");
  await expect(page.locator("form#f")).toBeVisible();
  const unsafe = await page.locator("a[href^='javascript:'], a[href^='data:']").count();
  expect(unsafe).toBe(0);
  expect(errors).toEqual([]);
});

test("employee page loads without exposing a service-role credential in visible source", async ({ page }) => {
  const response = await page.goto("http://127.0.0.1:4173/staff.html");
  expect(response?.ok()).toBeTruthy();
  const html = await page.content();
  expect(html).not.toMatch(/service_role_[A-Za-z0-9_-]{20,}/i);
});


test("strict hash-based CSP permits required inline scripts and handlers without unsafe-inline", async ({ page }) => {
  const violations = [];
  page.on("console", message => {
    if (/Content Security Policy|Refused to execute inline|Refused to apply inline/i.test(message.text())) violations.push(message.text());
  });
  await page.goto("http://127.0.0.1:4173/index.html");
  await page.locator("button[onclick=\"setLanguage('en')\"]").click();
  await expect(page.locator("#english")).toBeVisible();
  await page.locator("button[onclick=\"setLanguage('ar')\"]").click();
  await expect(page.locator("#arabic")).toBeVisible();
  await page.goto("http://127.0.0.1:4173/order.html");
  await expect(page.locator("#f")).toBeVisible();
  await page.goto("http://127.0.0.1:4173/staff.html");
  await expect(page.locator("#login")).toBeVisible();
  expect(violations).toEqual([]);
});
