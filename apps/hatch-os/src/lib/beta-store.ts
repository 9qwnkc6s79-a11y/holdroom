import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";
import { dailyMessageCap, safeCode } from "./testers.ts";

const ROOT = "hatch-beta";

function localRoot() {
  return process.env.HATCH_BETA_DIR || (process.env.VERCEL ? "/tmp/hatch-beta" : path.join(process.cwd(), ".beta-local"));
}

function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readText(pathname: string): Promise<string | null> {
  if (blobEnabled()) {
    try {
      const blob = await get(`${ROOT}/${pathname}`, { access: "private", useCache: false });
      if (!blob) return null;
      return await new Response(blob.stream).text();
    } catch {
      return null;
    }
  }
  const file = path.join(localRoot(), pathname);
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

async function writeText(pathname: string, body: string) {
  if (blobEnabled()) {
    await put(`${ROOT}/${pathname}`, body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return;
  }
  const file = path.join(localRoot(), pathname);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body);
}

export async function deleteRecord(folder: string, name: string) {
  if (blobEnabled()) {
    await del(`${ROOT}/${folder}/${name}.json`);
    return;
  }
  try {
    unlinkSync(path.join(localRoot(), folder, `${name}.json`));
  } catch {
    /* already gone */
  }
}

export async function readRecord<T>(folder: string, name: string): Promise<T | null> {
  const raw = await readText(`${folder}/${name}.json`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveRecord(folder: string, name: string, data: unknown) {
  await writeText(`${folder}/${name}.json`, JSON.stringify(data));
}

export async function readRecords<T>(folder: string): Promise<T[]> {
  if (blobEnabled()) {
    const found: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `${ROOT}/${folder}/`, cursor, limit: 100 });
      for (const blob of page.blobs) {
        const raw = await readText(blob.pathname.replace(`${ROOT}/`, ""));
        if (!raw) continue;
        try {
          found.push(JSON.parse(raw) as T);
        } catch {
          /* skip a bad record */
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return found;
  }
  const dir = path.join(localRoot(), folder);
  const found: T[] = [];
  const walk = (current: string) => {
    let names: string[] = [];
    try {
      names = readdirSync(current);
    } catch {
      return;
    }
    for (const name of names) {
      const full = path.join(current, name);
      if (name.endsWith(".json") && statSync(full).isFile()) {
        try {
          found.push(JSON.parse(readFileSync(full, "utf8")) as T);
        } catch {
          /* skip */
        }
      } else if (statSync(full).isDirectory()) {
        walk(full);
      }
    }
  };
  walk(dir);
  return found;
}

export async function consumeDailyMessage(code: string): Promise<{ ok: boolean; used: number; cap: number }> {
  const cap = dailyMessageCap();
  const day = new Date().toISOString().slice(0, 10);
  const key = `usage/${safeCode(code)}/${day}`;
  let used = 0;
  try {
    const raw = await readText(`${key}.json`);
    if (raw) used = Number(JSON.parse(raw).count) || 0;
  } catch {
    return { ok: true, used: 0, cap };
  }
  if (used >= cap) return { ok: false, used, cap };
  const next = used + 1;
  try {
    await writeText(`${key}.json`, JSON.stringify({ count: next, day }));
  } catch {
    return { ok: true, used, cap };
  }
  return { ok: true, used: next, cap };
}
