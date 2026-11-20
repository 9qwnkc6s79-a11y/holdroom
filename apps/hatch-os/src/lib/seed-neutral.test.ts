import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const BANNED = /boundaries|prosper|little elm|rafael|heath|coffee|toast|kss|keene/i;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

test("sample firm seed has no leftover firm names", () => {
  const root = path.join(import.meta.dirname, "../../seed");
  const hits: string[] = [];
  for (const file of walk(root)) {
    if (BANNED.test(path.basename(file)) || BANNED.test(readFileSync(file, "utf8"))) {
      hits.push(path.relative(root, file));
    }
  }
  assert.deepEqual(hits, []);
});
