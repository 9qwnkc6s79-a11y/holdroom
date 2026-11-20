import { expect, test, type Page } from "@playwright/test";

async function openSettings(page: Page, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  await page.addInitScript((mode) => localStorage.setItem("hatch-theme", mode), scheme);
  await page.goto("/signin");
  const got = page.getByRole("button", { name: "Got it" });
  if (await got.isVisible().catch(() => false)) await got.click();
  await page.getByRole("button", { name: /Staff preview/ }).click();
  await expect(page.getByRole("button", { name: "New agent" })).toBeVisible();
  const banner = page.getByRole("button", { name: "Got it" });
  if (await banner.isVisible().catch(() => false)) await banner.click();
  await page.getByRole("button", { name: "Account and settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

for (const scheme of ["light", "dark"] as const) {
  test(`connect apps in ${scheme}`, async ({ page }, testInfo) => {
    await openSettings(page, scheme);
    await page.getByRole("button", { name: /Connect apps/ }).click();
    await expect(page.getByRole("heading", { name: "Connect apps" })).toBeVisible();
    const search = page.getByLabel("Search connectors");
    await expect(search).toBeVisible();
    await search.fill("notion");
    await expect(page.getByRole("button", { name: /Notion/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /GitHub/ })).toHaveCount(0);
    if (testInfo.project.name === "chromium") {
      await page.screenshot({ path: `/opt/cursor/artifacts/hatch-connect-apps-${scheme}.png` });
    }
    const title = await page.locator(".set-card strong").first().evaluate((el) => getComputedStyle(el).color);
    const card = await page.locator(".set-card").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(title).not.toBe(card);
  });

  test(`model and ethics in ${scheme}`, async ({ page }, testInfo) => {
    await openSettings(page, scheme);
    await page.getByRole("button", { name: /Model & Ethics/ }).click();
    await expect(page.getByRole("heading", { name: "Model & Ethics" })).toBeVisible();
    await page.getByLabel("Firm charter").fill("Cedar charter for the desk");
    await page.getByLabel("Temperature").fill("0.4");
    await page.getByRole("button", { name: "Qwen 3.8 27B" }).click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    if (testInfo.project.name === "chromium") {
      await page.screenshot({ path: `/opt/cursor/artifacts/hatch-model-ethics-${scheme}.png` });
    }
    await page.reload();
    const banner = page.getByRole("button", { name: "Got it" });
    if (await banner.isVisible().catch(() => false)) await banner.click();
    await page.getByRole("button", { name: "Account and settings" }).click();
    await page.getByRole("button", { name: /Model & Ethics/ }).click();
    await expect(page.getByLabel("Firm charter")).toHaveValue(/Cedar charter/);
  });
}

test("connector forms validate and oauth routes stay healthy", async ({ page }, testInfo) => {
  await openSettings(page, "light");
  await page.getByRole("button", { name: /Connect apps/ }).click();
  await page.getByLabel("Search connectors").fill("");
  await page.getByRole("button", { name: /^Email/ }).click();
  await expect(page.getByLabel("IMAP host")).toBeVisible();
  if (testInfo.project.name === "chromium") {
    await page.screenshot({ path: "/opt/cursor/artifacts/hatch-connector-setup.png" });
  }
  await page.getByRole("button", { name: "Save connection" }).click();
  const missing = await page.getByLabel("Mailbox address").evaluate((el: HTMLInputElement) => el.validity.valueMissing);
  expect(missing).toBe(true);
  await page.getByLabel("Mailbox address").fill("not-an-email");
  await page.getByLabel("Mailbox password").fill("secret-test");
  await page.getByRole("button", { name: "Save connection" }).click();
  const mismatch = await page.getByLabel("Mailbox address").evaluate((el: HTMLInputElement) => el.validity.typeMismatch);
  expect(mismatch).toBe(true);
  const rejected = await page.request.post("/api/connectors", {
    data: { kind: "email", scope: "staff", email: "ada@example.com", password: "x" },
  });
  expect(rejected.status()).toBe(400);
  for (const kind of ["google", "microsoft", "slack"]) {
    const res = await page.request.get(`/api/connectors/${kind}/start`);
    expect(res.status(), kind).toBeLessThan(500);
    const body = await res.json();
    expect(body.callbackUrl, kind).toContain(`/api/connectors/${kind}/callback`);
  }
  const saved = await page.request.put("/api/ethics", {
    data: { scope: "staff", profile: { charter: "Cedar charter for the desk", model: "qwen", temperature: 0.4, posture: "direct" } },
  });
  expect(saved.ok()).toBeTruthy();
  const chat = await page.request.post("/api/chat", {
    data: { query: "Say the word cedar.", testerCode: "staff", agent: true, departmentId: "hq-ops" },
  });
  expect(chat.status()).toBeLessThan(500);
  expect(chat.headers()["x-hatch-model"]).toBe("qwen");
  expect(chat.headers()["x-hatch-temperature"]).toBe("0.4");
});
