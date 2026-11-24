import assert from "node:assert/strict";
import test from "node:test";
import { flattenSphere, sphereParams } from "./sphereStates.ts";

test("sphere states match the Presence spec", () => {
  const idle = sphereParams("idle");
  assert.equal(idle.speed, 0.24);
  assert.equal(idle.swirl, 1.05);
  assert.equal(idle.bloom, 0.26);
  assert.equal(idle.audio, 0);
  assert.equal(idle.coreFocus, 10.5);

  const listening = sphereParams("listening");
  assert.equal(listening.speed, 0.58);
  assert.equal(listening.ringPulse, 0.32);
  assert.equal(listening.audio, 0.52);

  const thinking = sphereParams("thinking");
  assert.equal(thinking.speed, 1.05);
  assert.equal(thinking.audio, 0.08);

  const speaking = sphereParams("speaking");
  assert.equal(speaking.ringPulse, 0.18);
  assert.equal(speaking.breathFreq, 3.1);

  const approval = sphereParams("needsApproval");
  assert.equal(approval.speed, 0.22);
  assert.equal(approval.core[0], idle.core[0]);
  assert.equal(approval.core[2], idle.core[2]);
  assert.ok(Math.abs(approval.breathFreq - (2 * Math.PI) / 2.8) < 0.001);
  const amber = 0xf5 / 255;
  const sky = 0x84 / 255;
  const mixed = sky + (amber - sky) * 0.24;
  assert.ok(Math.abs((approval.ring[0] ?? 0) - mixed) < 0.02);
  assert.equal(flattenSphere(idle).length, 28);
});
