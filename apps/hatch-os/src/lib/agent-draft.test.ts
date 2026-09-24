import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRAFT_NUDGE,
  PROSE_ONLY_DRAFT,
  finishSoftDraft,
  resolveDraftDepartment,
  shouldNudgeSoftDraft,
} from "./agent-draft.ts";
import { looksSoftDraft } from "./agent-intent.ts";

describe("soft draft agent reliability", () => {
  it("nudges once when a draft turn returns prose and no write_draft", () => {
    assert.equal(looksSoftDraft("Draft a short note about catering"), true);
    assert.equal(shouldNudgeSoftDraft(0, "Draft a short note about catering", []), true);
    assert.equal(shouldNudgeSoftDraft(1, "Draft a short note about catering", []), false);
    assert.equal(shouldNudgeSoftDraft(0, "Draft a short note", [{ name: "write_draft" }]), false);
    assert.match(DRAFT_NUDGE, /write_draft/);
  });

  it("forces write_draft from prose using history-free department fallback", () => {
    const forced = finishSoftDraft({
      query: "Draft a short note about opening",
      text: "Open at 6am. Check the pastry case.",
      tools: [],
      defaultDepartmentId: "little-elm",
    });
    assert.equal(forced.toolCall?.name, "write_draft");
    assert.equal(forced.toolCall?.arguments.departmentId, "little-elm");
    assert.equal(forced.notice, undefined);
    assert.match(String(forced.toolCall?.arguments.text), /Open at 6am/);
  });

  it("does not invent a department when none is sticky or named", () => {
    const prose = finishSoftDraft({
      query: "Draft a short note",
      text: "Remember to text COFFEE.",
      tools: [],
    });
    assert.equal(prose.toolCall, undefined);
    assert.equal(prose.notice, PROSE_ONLY_DRAFT);
    assert.equal(resolveDraftDepartment("Draft a note for Prosper"), "prosper");
  });

  it("leaves a successful write_draft alone", () => {
    const done = finishSoftDraft({
      query: "Draft a short note",
      text: "Saved.",
      tools: [{ name: "write_draft" }],
      defaultDepartmentId: "little-elm",
    });
    assert.equal(done.toolCall, undefined);
    assert.equal(done.notice, undefined);
    assert.equal(done.text, "Saved.");
  });
});
