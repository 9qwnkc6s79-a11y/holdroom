import { expect, test, type Page } from "@playwright/test";

async function openHatch(page: Page) {
  await page.route("**/sw.js", (route) => route.abort());
  await page.goto("/signin");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((regs || []).map((reg) => reg.unregister()));
  });
  const got = page.getByRole("button", { name: "Got it" });
  if (await got.isVisible().catch(() => false)) await got.click();
  await page.getByRole("button", { name: /Staff preview/ }).click();
  await expect(page.getByRole("button", { name: "New agent" })).toBeVisible();
  await page.goto("/chat?agent=general");
  const again = page.getByRole("button", { name: "Got it" });
  if (await again.isVisible().catch(() => false)) await again.click();
  await expect(page.getByLabel("Ask Hatch")).toBeVisible();
}

test("send button fits and sends", async ({ page }) => {
  await openHatch(page);
  const composer = page.locator(".composer-row");
  const before = await composer.locator("button, textarea").evaluateAll((els) =>
    els.map((el) => ({ label: el.getAttribute("aria-label"), right: el.getBoundingClientRect().right })),
  );
  for (const item of before) expect(item.right, item.label || "").toBeLessThanOrEqual(386);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);

  await page.getByLabel("Ask Hatch").fill("Say hello from the desk");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  const after = await composer.locator("button, textarea").evaluateAll((els) =>
    els.map((el) => ({ label: el.getAttribute("aria-label"), right: el.getBoundingClientRect().right })),
  );
  for (const item of after) expect(item.right, item.label || "").toBeLessThanOrEqual(386);
  await expect(page.getByRole("button", { name: "Voice conversation" })).toHaveCount(0);

  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".bubble.user").getByText("Say hello from the desk").first()).toBeVisible();
  await expect(page.locator(".bubble.agent").last()).not.toHaveText(/Warming up/i, { timeout: 20_000 });
});

test("a pending job resumes after reload", async ({ page }) => {
  let released = false;
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST" || route.request().url().includes("/step")) return route.fallback();
    await route.fulfill({
      json: {
        phase: "wait",
        note: "Warming up test server…",
        state: { job: { id: "job-resume" }, marker: "keep" },
      },
    });
  });
  await page.route("**/api/chat/step", async (route) => {
    await route.fulfill({
      json: released
        ? { phase: "done", text: "resumed from the queue" }
        : { phase: "wait", note: "Warming up test server…", state: { job: { id: "job-resume" }, marker: "keep" } },
    });
  });
  await openHatch(page);
  await page.getByLabel("Ask Hatch").fill("Hold this turn");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const waiting = page.locator(".bubble.agent").filter({ hasText: "Warming up test server" }).last();
  await expect(waiting).toBeVisible();
  await expect(waiting).toContainText(/0:\d\d/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("hatch-pending-jobs") || "")).toContain("job-resume");
  released = true;
  await page.reload();
  const again = page.getByRole("button", { name: "Got it" });
  if (await again.isVisible().catch(() => false)) await again.click();
  await expect(page.locator(".bubble.agent").filter({ hasText: "resumed from the queue" }).last()).toBeVisible();
});

test("an attached text file is quoted back", async ({ page }, testInfo) => {
  await openHatch(page);
  await page.getByLabel("Ask Hatch").fill("Say hello from the desk");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".bubble.agent").last()).not.toHaveText(/Warming up/i);
  await expect(page.locator(".working")).toHaveCount(0);
  await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("The unique phrase is marigold-ledger-441."),
  });
  await expect(page.locator(".composer .file-chip", { hasText: "note.txt" })).toBeVisible();
  await page.getByLabel("Ask Hatch").fill("What is in the file?");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  if (testInfo.project.name === "chromium") {
    await page.screenshot({ path: "/opt/cursor/artifacts/hatch-chat-fixed.png" });
  }
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".bubble.user .file-chip").getByText("note.txt").first()).toBeVisible();
  await expect(page.locator(".bubble.agent").getByText("marigold-ledger-441").first()).toBeVisible();
  await expect(page.locator(".bubble.agent").last()).not.toContainText(/Boundaries|Prosper|Little Elm|Rafael|Heath/);
});

test("dictate does not crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await openHatch(page);
  await page.getByRole("button", { name: "Dictate" }).click();
  await page.waitForTimeout(400);
  expect(errors.filter((item) => !/RSC payload|Falling back to browser navigation/i.test(item))).toEqual([]);
  await page.getByRole("button", { name: "Voice conversation" }).click();
  await expect(page.getByRole("button", { name: "Talk" })).toBeVisible();
  await page.getByRole("button", { name: "Talk" }).click();
  await page.waitForTimeout(400);
  expect(errors.filter((item) => !/RSC payload|Falling back to browser navigation/i.test(item))).toEqual([]);
});
