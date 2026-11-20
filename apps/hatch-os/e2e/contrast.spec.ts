import { expect, test, type Page } from "@playwright/test";

function channel(color: string) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`unparsed color ${color}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function linear(value: number) {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string) {
  const [r, g, b] = channel(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(foreground: string, background: string) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function openSettings(page: Page, theme: "light" | "dark" | "system") {
  await page.addInitScript((stored) => {
    localStorage.setItem("hatch-theme", stored);
  }, theme);
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

async function assertSettingsContrast(page: Page, mode: "light" | "dark") {
  const sample = await page.locator(".set-card").first().evaluate((card) => {
    const title = card.querySelector(".set-main strong");
    const subtitle = card.querySelector(".set-main span");
    const close = document.querySelector('button[aria-label="Close settings"]');
    const titleStyle = title ? getComputedStyle(title) : null;
    const subtitleStyle = subtitle ? getComputedStyle(subtitle) : null;
    const closeStyle = close ? getComputedStyle(close) : null;
    return {
      card: getComputedStyle(card).backgroundColor,
      title: titleStyle?.color || "",
      subtitle: subtitleStyle?.color || "",
      close: closeStyle?.color || "",
      closeBg: closeStyle?.backgroundColor || "",
    };
  });
  expect(contrast(sample.title, sample.card)).toBeGreaterThan(7);
  expect(contrast(sample.subtitle, sample.card)).toBeGreaterThan(4.5);
  expect(contrast(sample.close, sample.closeBg)).toBeGreaterThan(4.5);
  if (mode === "light") {
    expect(luminance(sample.card)).toBeGreaterThan(0.85);
    expect(luminance(sample.title)).toBeLessThan(0.15);
    expect(luminance(sample.closeBg)).toBeGreaterThan(0.85);
    expect(luminance(sample.close)).toBeLessThan(0.15);
  } else {
    expect(luminance(sample.card)).toBeLessThan(0.12);
    expect(luminance(sample.title)).toBeGreaterThan(0.75);
    expect(luminance(sample.close)).toBeGreaterThan(0.85);
    expect(luminance(sample.closeBg)).toBeLessThan(0.2);
  }
}

for (const scheme of ["light", "dark"] as const) {
  test(`settings contrast in ${scheme}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openSettings(page, scheme);
    await assertSettingsContrast(page, scheme);
    if (testInfo.project.name === "chromium") {
      await page.screenshot({ path: `/opt/cursor/artifacts/hatch-settings-${scheme}.png` });
    }
  });
}

test("system dark does not paint light titles on white cards", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openSettings(page, "system");
  await assertSettingsContrast(page, "dark");
});
