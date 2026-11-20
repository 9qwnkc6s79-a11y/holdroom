import { closeSync, existsSync, mkdirSync, openSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import path from "path";

const held = new Set<string>();
const STALE_LOCK_MS = 8_000;
const LOCK_WAIT_MS = 6_000;

function sleepMs(ms: number) {
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

/** Same-filesystem rename so readers never see a half-written JSON file. */
export function atomicWriteFile(file: string, contents: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents);
  renameSync(tmp, file);
}

export function withFileLock<T>(file: string, fn: () => T): T {
  if (held.has(file)) return fn();
  const lock = `${file}.lock`;
  mkdirSync(path.dirname(file), { recursive: true });
  const start = Date.now();
  while (true) {
    try {
      const fd = openSync(lock, "wx");
      held.add(file);
      try {
        writeFileSync(fd, `${process.pid}\n`);
        return fn();
      } finally {
        held.delete(file);
        closeSync(fd);
        try {
          unlinkSync(lock);
        } catch {
          /* already gone */
        }
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw err;
      if (existsSync(lock)) {
        try {
          if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) unlinkSync(lock);
        } catch {
          /* raced */
        }
      }
      if (Date.now() - start > LOCK_WAIT_MS) {
        try {
          unlinkSync(lock);
        } catch {
          /* continue */
        }
        continue;
      }
      sleepMs(15);
    }
  }
}
