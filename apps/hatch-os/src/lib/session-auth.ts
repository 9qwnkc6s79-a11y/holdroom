import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { vaultConfigured, vaultKey } from "./vault-crypto.ts";

export const SESSION_COOKIE_NAME = "hatch_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface HatchVerifiedSession {
  v: 1;
  scope: string;
  role: "Partner" | "Associate";
  label: string;
  departments: string[];
  enterprise: boolean;
  homeDepartment: string;
  iat: number;
  exp: number;
}

let ephemeralSecret: Buffer | null = null;

function signingKey(): Buffer {
  const explicit = (process.env.HATCH_SESSION_SECRET || "").trim();
  if (explicit) {
    return createHmac("sha256", "hatch-session-explicit-v1").update(explicit).digest();
  }
  if (vaultConfigured()) {
    return createHmac("sha256", vaultKey()).update("hatch-session-v1").digest();
  }
  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32);
  }
  return ephemeralSecret;
}

export function signSessionToken(
  input: Omit<HatchVerifiedSession, "v" | "iat" | "exp">,
  now = Date.now(),
): string {
  const payload: HatchVerifiedSession = {
    v: 1,
    scope: input.scope,
    role: input.role,
    label: input.label,
    departments: input.departments,
    enterprise: input.enterprise,
    homeDepartment: input.homeDepartment,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySessionToken(token: string | null | undefined, now = Date.now()): HatchVerifiedSession | null {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  if (!body || !mac) return null;
  const expected = createHmac("sha256", signingKey()).update(body).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<HatchVerifiedSession>;
    if (parsed.v !== 1 || !parsed.scope || !Array.isArray(parsed.departments)) return null;
    if (typeof parsed.exp !== "number" || parsed.exp <= now) return null;
    return {
      v: 1,
      scope: String(parsed.scope),
      role: parsed.role === "Associate" ? "Associate" : "Partner",
      label: String(parsed.label || ""),
      departments: parsed.departments.map(String),
      enterprise: Boolean(parsed.enterprise),
      homeDepartment: String(parsed.homeDepartment || "hq-ops"),
      iat: Number(parsed.iat || 0),
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function extractCookieToken(req: Request, cookieName = SESSION_COOKIE_NAME): string | null {
  const raw = req.headers.get("cookie") || "";
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name === cookieName) {
      const value = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

export function verifySessionRequest(
  req: Request,
  options?: { allowQueryToken?: boolean },
): HatchVerifiedSession | null {
  const bearer = extractBearerToken(req);
  if (bearer) {
    const verified = verifySessionToken(bearer);
    if (verified) return verified;
  }
  const cookie = extractCookieToken(req);
  if (cookie) {
    const verified = verifySessionToken(cookie);
    if (verified) return verified;
  }
  if (options?.allowQueryToken) {
    const queryToken = new URL(req.url).searchParams.get("token");
    if (queryToken) {
      const verified = verifySessionToken(queryToken);
      if (verified) return verified;
    }
  }
  return null;
}

export function requireSession(
  req: Request,
  options?: { allowQueryToken?: boolean },
): { session: HatchVerifiedSession; error?: never } | { session?: never; error: Response } {
  const session = verifySessionRequest(req, options);
  if (!session) {
    return {
      error: Response.json(
        { error: "Sign in required." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  return { session };
}

export function setSessionCookie(res: NextResponse, token: string, reqUrl: string) {
  const secure = reqUrl.startsWith("https://") || process.env.NODE_ENV === "production";
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(res: NextResponse, reqUrl: string) {
  const secure = reqUrl.startsWith("https://") || process.env.NODE_ENV === "production";
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}
