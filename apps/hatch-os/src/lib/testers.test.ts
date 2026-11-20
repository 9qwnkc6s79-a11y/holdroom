import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dailyMessageCap, parseTesterCodes, safeCode, testerByCode } from "./testers.ts";

describe("tester codes", () => {
  it("parses code:label pairs and ignores blanks", () => {
    process.env.HATCH_TESTER_CODES = " HATCH-AH7G:Tester 1, ,HATCH-JUB8:North desk ";
    const testers = parseTesterCodes();
    assert.equal(testers.length, 2);
    assert.equal(testers[0]?.code, "HATCH-AH7G");
    assert.equal(testers[1]?.label, "North desk");
    assert.equal(testerByCode("hatch-ah7g")?.label, "Tester 1");
    assert.equal(testerByCode("nope"), null);
    delete process.env.HATCH_TESTER_CODES;
  });

  it("caps messages per day from the env, defaulting to 200", () => {
    delete process.env.HATCH_DAILY_MESSAGE_CAP;
    assert.equal(dailyMessageCap(), 200);
    process.env.HATCH_DAILY_MESSAGE_CAP = "40";
    assert.equal(dailyMessageCap(), 40);
    delete process.env.HATCH_DAILY_MESSAGE_CAP;
  });

  it("keeps a usage key to letters, digits, and dashes", () => {
    assert.equal(safeCode(" hatch-ah7g "), "HATCH-AH7G");
    assert.equal(safeCode("../etc"), "ETC");
  });
});
