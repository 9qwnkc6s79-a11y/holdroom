import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parseInquiry, parseStatusPatch } from "./validate.js";

const root = join(import.meta.dirname, "..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

test("accepts a beta request", () => {
  const parsed = parseInquiry({
    requestType: "beta",
    name: "Ada Lovelace",
    email: "Ada@Firm.example",
    firm: "Analytical Engines",
    role: "Partner",
    firmSize: "50–250",
    notes: "Chat on our memos.",
    hp_field: "",
  });
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.value.email, "ada@firm.example");
  assert.equal(parsed.value.requestType, "beta");
});

test("honeypot is silent spam", () => {
  const parsed = parseInquiry({
    requestType: "beta",
    name: "Bot",
    email: "bot@example.com",
    firm: "Spam Co",
    hp_field: "https://spam.example",
  });
  assert.equal(parsed.spam, true);
  assert.equal(parsed.value, undefined);
});

test("rejects a bad email and oversized notes", () => {
  assert.equal(parseInquiry({ requestType: "inquiry", name: "A", email: "nope", firm: "B" }).error, "Enter a valid work email.");
  const notes = "x".repeat(2001);
  assert.match(parseInquiry({ requestType: "beta", name: "A", email: "a@b.co", firm: "B", notes }).error, /too long/);
});

test("approval requires a HATCH code", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.match(parseStatusPatch({ id, status: "approved", assignedCode: "" }).error, /invite code/i);
  const ok = parseStatusPatch({ id, status: "approved", assignedCode: "hatch-ab12" });
  assert.equal(ok.value.assignedCode, "HATCH-AB12");
  assert.equal(parseStatusPatch({ id, status: "declined" }).value.assignedCode, null);
});

test("public files do not expose the retired host or a personal mailbox", () => {
  const banned = ["mail" + "to:", ["daniel", "keene223", "gmail.com"].join("."), "holdroom." + "ai", "holdroom." + "vercel.app"];
  const hits = [];
  for (const path of walk(root)) {
    if (!/\.(html|js|css|xml|txt|md|webmanifest)$/.test(path)) continue;
    const body = readFileSync(path, "utf8");
    for (const token of banned) {
      if (body.includes(token)) hits.push(`${path} contains ${token}`);
    }
  }
  assert.deepEqual(hits, []);
});
