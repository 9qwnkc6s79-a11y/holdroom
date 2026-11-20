import assert from "node:assert/strict";
import test from "node:test";
import { compileEthics, defaultEthics, normalizeEthics } from "./ethics-profile.ts";

test("ethics charter is compiled into the model instructions", () => {
  const profile = normalizeEthics({
    ...defaultEthics(),
    charter: "Cedar charter for the firm",
    model: "qwen",
    temperature: 1.4,
    posture: "direct",
  });
  assert.equal(profile.temperature, 0.9);
  assert.match(compileEthics(profile), /Cedar charter for the firm/);
  assert.match(compileEthics(profile), /Qwen for this drafting turn/);
  assert.match(compileEthics(profile, { toolTurn: true }), /runs on Hermes/);
  assert.match(compileEthics(profile), /Direct analyst/);
});
