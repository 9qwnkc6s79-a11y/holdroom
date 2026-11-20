import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const apply = () => {
      document.documentElement.style.setProperty("--safe-inset-top", "59px");
      document.documentElement.style.setProperty("--safe-inset-bottom", "34px");
    };
    if (document.documentElement) apply();
    else document.addEventListener("DOMContentLoaded", apply);
  });
});

async function notch(page: import("@playwright/test").Page) {
  await page.addStyleTag({
    content: ":root { --safe-inset-top: 59px; --safe-inset-bottom: 34px; }",
  });
}

async function topOf(page: import("@playwright/test").Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
}

test("headers clear a 59px status bar and Send is a filled button", async ({ page }) => {
  await page.goto("/");
  await notch(page);
  await page.getByRole("button", { name: "Got it" }).click();
  await page.getByRole("button", { name: "Staff preview" }).click();
  await expect(page.getByRole("button", { name: "New agent" })).toBeVisible();

  expect(await topOf(page, '[aria-label="Account and settings"]')).toBeGreaterThanOrEqual(59);

  await page.getByRole("button", { name: "New agent" }).click();
  expect(await topOf(page, '[aria-label="New agent"] [aria-label="Close"]')).toBeGreaterThanOrEqual(59);
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Hatch" }).first().click();
  await expect(page.getByLabel("Ask Hatch")).toBeVisible();
  expect(await topOf(page, 'section.chat [aria-label="Back"]')).toBeGreaterThanOrEqual(59);

  await page.locator(".who").click();
  expect(await topOf(page, '[aria-label="Hatch info"] [aria-label="Close"]')).toBeGreaterThanOrEqual(59);
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Send feedback" }).click();
  const close = page.getByRole("dialog", { name: "Send feedback" }).getByRole("button", { name: "Close" });
  await expect(close).toBeVisible();
  expect(await topOf(page, '[aria-label="Send feedback"] [aria-label="Close"]')).toBeGreaterThanOrEqual(59);
  const box = await close.boundingBox();
  expect(box && box.width).toBeGreaterThanOrEqual(44);
  expect(box && box.height).toBeGreaterThanOrEqual(44);

  const send = page.getByRole("dialog", { name: "Send feedback" }).getByRole("button", { name: "Send" });
  const bg = await send.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(11, 59, 50)");
  await page.screenshot({ path: "/opt/cursor/artifacts/hatch-feedback-safe.png" });

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Account and settings" }).click();
  expect(await topOf(page, '[aria-label="Close settings"]')).toBeGreaterThanOrEqual(59);
  await page.getByRole("button", { name: /^Vault/ }).click();
  expect(await topOf(page, '[aria-label="Settings"] [aria-label="Back"]')).toBeGreaterThanOrEqual(59);
});
