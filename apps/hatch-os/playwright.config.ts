import { defineConfig } from "@playwright/test";

const vaultKey = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3015",
    browserName: "chromium",
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  webServer: {
    command: "npx next build --turbopack && npx next start -p 3015",
    url: "http://127.0.0.1:3015/signin",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      HATCH_DEMO_MODE: "1",
      HATCH_VAULT_KEY: vaultKey,
      HATCH_TESTER_CODES: "HATCH-TEST:Playwright",
      HATCH_ADMIN_CODE: "playwright-admin",
      HATCH_DAILY_MESSAGE_CAP: "50",
    },
  },
});
