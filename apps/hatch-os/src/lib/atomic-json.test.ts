import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { atomicWriteFile, withFileLock } from "./atomic-json.ts";

describe("atomic json + file lock", () => {
  it("rewrites atomically and allows reentrant locks", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hatch-lock-"));
    const file = path.join(dir, "state.json");
    try {
      atomicWriteFile(file, '{"n":1}\n');
      assert.equal(readFileSync(file, "utf8"), '{"n":1}\n');
      const nested = withFileLock(file, () =>
        withFileLock(file, () => {
          atomicWriteFile(file, '{"n":2}\n');
          return 2;
        }),
      );
      assert.equal(nested, 2);
      assert.equal(readFileSync(file, "utf8"), '{"n":2}\n');
      assert.equal(existsSync(`${file}.lock`), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
