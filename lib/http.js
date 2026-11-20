import { createHash, timingSafeEqual } from "node:crypto";

export function json(data, status = 200, extra = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

export function sameSite(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim();
  return ip || "unknown";
}

export function clip(value, max) {
  const text = String(value || "").replace(/[\u0000-\u001F]/g, "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

export async function readJson(request, max = 32000) {
  const claimed = Number(request.headers.get("content-length") || 0);
  if (claimed > max) {
    const error = new Error("too_large");
    error.status = 413;
    throw error;
  }
  const text = await request.text();
  if (text.length > max) {
    const error = new Error("too_large");
    error.status = 413;
    throw error;
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }
}

export function adminConfigured() {
  return Boolean(process.env.HATCH_SITE_ADMIN_CODE);
}

export function adminAuthorized(request) {
  const expected = process.env.HATCH_SITE_ADMIN_CODE || "";
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function bodyError(error) {
  if (error && error.status === 413) return json({ ok: false, error: "Payload too large." }, 413);
  if (error && error.status === 400) return json({ ok: false, error: "Invalid JSON." }, 400);
  return null;
}
