import { del, get, list, put } from "@vercel/blob";
import { createHash } from "node:crypto";

const RECORDS = "site-requests/records/";
const RATE = "site-requests/rl/";

const putOptions = {
  access: "private",
  contentType: "application/json",
  addRandomSuffix: false,
  allowOverwrite: true,
  cacheControlMaxAge: 60,
};

async function readPath(pathname) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

async function writePath(pathname, data) {
  await put(pathname, JSON.stringify(data), putOptions);
}

export function recordPath(id) {
  return `${RECORDS}${id}.json`;
}

export async function saveRecord(record) {
  await writePath(recordPath(record.id), record);
}

export async function readRecord(id) {
  return readPath(recordPath(id));
}

export async function deleteRecord(id) {
  await del(recordPath(id));
}

export async function listRecords() {
  const records = [];
  let cursor;
  do {
    const page = await list({ prefix: RECORDS, cursor, limit: 200 });
    for (const blob of page.blobs) {
      try {
        const record = await readPath(blob.pathname);
        if (record && record.id) records.push(record);
      } catch (error) {
        console.error("skip unreadable request", blob.pathname, error && error.message);
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return records;
}

export async function rateLimit(bucket, ip, limit, windowMs) {
  const id = createHash("sha256").update(`${bucket}|${ip}`).digest("hex").slice(0, 32);
  const pathname = `${RATE}${id}.json`;
  const now = Date.now();
  let stamps = [];
  try {
    const existing = await readPath(pathname);
    if (existing && Array.isArray(existing.stamps)) stamps = existing.stamps.filter((stamp) => now - stamp < windowMs);
  } catch (error) {
    console.error("rate limit read failed", error && error.message);
    return false;
  }
  if (stamps.length >= limit) return true;
  stamps.push(now);
  try {
    await writePath(pathname, { stamps });
  } catch (error) {
    console.error("rate limit write failed", error && error.message);
  }
  return false;
}
