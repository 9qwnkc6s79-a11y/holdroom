import assert from "node:assert/strict";
import test from "node:test";
import { privacyUrl, resolveApiBase, resolveLegalUrl, termsUrl } from "./config.ts";

test("the firm host defaults to the Hatch OS beta", () => {
  assert.equal(resolveApiBase(undefined), "https://hatch-os-beta.vercel.app");
  assert.equal(resolveApiBase("https://example.com/"), "https://example.com");
});

test("legal URLs default to hatchsystems.ai and allow https overrides", () => {
  assert.equal(privacyUrl(), "https://hatchsystems.ai/privacy");
  assert.equal(termsUrl(), "https://hatchsystems.ai/terms");
  assert.equal(resolveLegalUrl("https://example.com/p", "https://hatchsystems.ai/privacy"), "https://example.com/p");
  assert.equal(resolveLegalUrl("javascript:alert(1)", "https://hatchsystems.ai/privacy"), "https://hatchsystems.ai/privacy");
});
