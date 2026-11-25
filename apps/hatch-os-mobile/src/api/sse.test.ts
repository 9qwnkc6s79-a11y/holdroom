import assert from "node:assert/strict";
import test from "node:test";
import { drainSse } from "./sse.ts";

test("server-sent chat frames parse into events", () => {
  const parsed = drainSse('data: {"delta":"Hi"}\n\ndata: {"done":true,"text":"Hi"}\n\n');
  assert.equal(parsed.events.length, 2);
  assert.equal(parsed.events[0]?.delta, "Hi");
  assert.equal(parsed.events[1]?.done, true);
  assert.equal(parsed.rest, "");
});
