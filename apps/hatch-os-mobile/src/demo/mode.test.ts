import assert from "node:assert/strict";
import test from "node:test";
import { demoMode } from "./mode.ts";

test("demo seed stays off unless the flag is set", () => {
  assert.equal(demoMode(undefined), false);
  assert.equal(demoMode(""), false);
  assert.equal(demoMode("0"), false);
  assert.equal(demoMode("1"), true);
  assert.equal(demoMode("true"), true);
});
