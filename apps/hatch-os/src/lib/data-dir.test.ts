import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { hatchDataDir } from "./data-dir.ts";

describe("hatchDataDir", () => {
  const prev = process.env.VERCEL;
  const prevDir = process.env.HATCH_DATA_DIR;

  after(() => {
    if (prev == null) delete process.env.VERCEL;
    else process.env.VERCEL = prev;
    if (prevDir == null) delete process.env.HATCH_DATA_DIR;
    else process.env.HATCH_DATA_DIR = prevDir;
  });

  it("uses /tmp on Vercel so creating an agent can be saved", () => {
    delete process.env.HATCH_DATA_DIR;
    process.env.VERCEL = "1";
    assert.equal(hatchDataDir(), "/tmp/hatch-os");
  });
});
