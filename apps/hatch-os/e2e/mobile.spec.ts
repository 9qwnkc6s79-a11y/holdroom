import { expect, test } from "@playwright/test";

test("invite code signs in", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("Your code").fill("HATCH-TEST");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "New agent" })).toBeVisible();
});

test("create an agent, keep a chat across reload, and open settings", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Got it" }).click();
  await page.getByRole("button", { name: "Staff preview" }).click();
  await page.getByRole("button", { name: "New agent" }).click();
  await page.getByLabel("Name").fill("QA Desk");
  await page.getByLabel("Description").fill("Notes for the pass");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByLabel("Ask QA Desk")).toBeVisible();

  const composer = page.getByLabel("Ask QA Desk");
  await composer.fill("Hello from the phone");
  await composer.press("Enter");
  await expect(page.getByText("Hello from the phone")).toBeVisible();
  await expect(page.getByText(/file room/i).first()).toBeVisible();

  await composer.fill("Second note");
  await composer.press("Enter");
  await expect(page.getByText("Second note")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Hello from the phone")).toBeVisible();
  await expect(page.getByText("Second note")).toBeVisible();

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Account and settings" }).click();
  await page.getByRole("button", { name: /^Vault/ }).click();
  await expect(page.getByRole("heading", { name: "Vault" })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: /^Permissions/ }).click();
  await expect(page.getByRole("heading", { name: "Permissions" })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByRole("button", { name: "New agent" })).toBeVisible();
  await expect(page.getByText("QA Desk").first()).toBeVisible();
});
