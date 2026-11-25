import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hatchDataDir } from "./data-dir.ts";

function safeId(fileId: string) {
  return fileId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function visionPath(fileId: string) {
  return path.join(hatchDataDir(), "vision", `${safeId(fileId)}.jpg`);
}

export function writeVisionJpeg(fileId: string, jpeg: Buffer) {
  const dest = visionPath(fileId);
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, jpeg);
}

export function readVisionJpeg(fileId: string): Buffer | null {
  const dest = visionPath(fileId);
  if (!existsSync(dest)) return null;
  return readFileSync(dest);
}

/** Keep a resized JPEG where the next request can read it. Blob covers a different Vercel instance. */
export async function mirrorVisionJpeg(fileId: string, jpeg: Buffer) {
  writeVisionJpeg(fileId, jpeg);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  const { put } = await import("@vercel/blob");
  await put(`hatch-images/${safeId(fileId)}.jpg`, jpeg, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "image/jpeg",
  });
}

export async function loadVisionJpeg(fileId: string): Promise<Buffer | null> {
  const local = readVisionJpeg(fileId);
  if (local?.length) return local;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { get } = await import("@vercel/blob");
    const blob = await get(`hatch-images/${safeId(fileId)}.jpg`, { access: "private" });
    if (!blob) return null;
    const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
    if (!bytes.length) return null;
    writeVisionJpeg(fileId, bytes);
    return bytes;
  } catch {
    return null;
  }
}
