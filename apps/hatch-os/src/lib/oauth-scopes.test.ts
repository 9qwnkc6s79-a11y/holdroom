import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GOOGLE_OAUTH_SCOPE, IOS_OAUTH_RETURN, MICROSOFT_OAUTH_SCOPE, accountId } from "./connectors.ts";
import { passageFilename, rankPassages } from "./library-passages.ts";

describe("oauth scopes", () => {
  it("asks Google for read-only mail, drive, and calendar", () => {
    assert.match(GOOGLE_OAUTH_SCOPE, /gmail\.readonly/);
    assert.match(GOOGLE_OAUTH_SCOPE, /drive\.readonly/);
    assert.match(GOOGLE_OAUTH_SCOPE, /calendar\.readonly/);
    assert.equal(/gmail\.modify|calendar\.events/.test(GOOGLE_OAUTH_SCOPE), false);
  });

  it("asks Microsoft for read-only mail, files, and calendar", () => {
    assert.match(MICROSOFT_OAUTH_SCOPE, /Mail\.Read/);
    assert.match(MICROSOFT_OAUTH_SCOPE, /Files\.Read\.All/);
    assert.match(MICROSOFT_OAUTH_SCOPE, /Calendars\.Read/);
    assert.match(MICROSOFT_OAUTH_SCOPE, /offline_access/);
    assert.equal(/Mail\.Send|Calendars\.ReadWrite|Files\.ReadWrite/.test(MICROSOFT_OAUTH_SCOPE), false);
  });

  it("returns the iPhone to the app scheme, not to a provider", () => {
    assert.equal(IOS_OAUTH_RETURN, "hatchos://oauth");
  });

  it("keeps a second account instead of reusing the kind as the only id", () => {
    assert.equal(accountId("google", "Ada@Example.com"), "google--ada-example-com");
    assert.notEqual(accountId("google", "Ada@Example.com"), accountId("google", "Bea@Example.com"));
  });
});

describe("library passages", () => {
  it("matches firm text and does not invent a hit", () => {
    const hits = rankPassages(
      [{ title: "Lease", text: "The north desk lease renews in June.", source: "Gmail" }],
      "lease june",
    );
    assert.equal(hits[0]?.room, "Gmail");
    assert.equal(rankPassages([{ title: "Lease", text: "June", source: "Gmail" }], "payroll").length, 0);
  });

  it("names synced files as markdown the file room accepts", () => {
    assert.equal(passageFilename("Gmail-ABC_1"), "gmail-abc-1.md");
  });

  it("does not mention a frontier API in the sync path", () => {
    const source = readFileSync(new URL("./connector-sync.ts", import.meta.url), "utf8");
    assert.equal(/api\.openai\.com|api\.anthropic\.com/.test(source), false);
  });
});
