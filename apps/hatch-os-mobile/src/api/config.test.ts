import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiBase } from "./config.ts";

test("the firm host defaults to the Hatch OS beta", () => {
  assert.equal(resolveApiBase(undefined), "https://hatch-os-beta.vercel.app");
  assert.equal(resolveApiBase("https://example.com/"), "https://example.com");
});
