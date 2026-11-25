import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  signSessionToken,
  verifySessionRequest,
  verifySessionToken,
} from "./session-auth.ts";

test("signSessionToken and verifySessionToken round-trip and reject tampering or expiry", () => {
  process.env.HATCH_SESSION_SECRET = "test-session-secret-for-unit-tests";
  const now = 1_700_000_000_000;
  const token = signSessionToken(
    {
      scope: "HATCH-AH7G",
      role: "Partner",
      label: "Daniel",
      departments: ["north-desk", "south-desk", "hq-ops", "legal", "finance"],
      enterprise: true,
      homeDepartment: "hq-ops",
    },
    now,
  );
  const verified = verifySessionToken(token, now + 5000);
  assert.ok(verified);
  assert.equal(verified.scope, "HATCH-AH7G");
  assert.equal(verified.role, "Partner");
  assert.equal(verified.enterprise, true);

  // Tampered payload rejected
  const [body, mac] = token.split(".");
  const tampered = `${body.slice(0, -1)}A.${mac}`;
  assert.equal(verifySessionToken(tampered, now + 5000), null);

  // Expired token rejected
  assert.equal(verifySessionToken(token, now + SESSION_TTL_MS + 1), null);
});

test("verifySessionRequest reads Authorization Bearer and httpOnly cookie", () => {
  process.env.HATCH_SESSION_SECRET = "test-session-secret-for-unit-tests";
  const token = signSessionToken({
    scope: "HATCH-AH7G",
    role: "Partner",
    label: "Tester 1",
    departments: ["hq-ops"],
    enterprise: true,
    homeDepartment: "hq-ops",
  });

  const bearerReq = new Request("https://hatch.example/api/chat", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(verifySessionRequest(bearerReq)?.scope, "HATCH-AH7G");

  const cookieReq = new Request("https://hatch.example/api/library", {
    headers: { Cookie: `other=1; ${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` },
  });
  assert.equal(verifySessionRequest(cookieReq)?.scope, "HATCH-AH7G");

  const unauthReq = new Request("https://hatch.example/api/chat", {
    headers: { "x-hatch-tester": "HATCH-AH7G" },
  });
  assert.equal(verifySessionRequest(unauthReq), null);
});
