import assert from "node:assert/strict";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { after, before, describe, it } from "node:test";
import { approvalCardForCall } from "./approvals.ts";
import { toolNeedsApproval } from "./action-cards.ts";
import { demoModeEnabled, planDemoReply } from "./demo.ts";
import { createVaultItem, listVaultPublic, revealVaultItem, scrubVaultSecrets } from "./vault.ts";

const prevKey = process.env.HATCH_VAULT_KEY;
const prevPath = process.env.HATCH_VAULT_PATH;
const prevDemo = process.env.HATCH_DEMO_MODE;

before(() => {
  process.env.HATCH_VAULT_KEY = "ab".repeat(32);
  process.env.HATCH_VAULT_PATH = path.join(mkdtempSync(path.join(tmpdir(), "hatch-vault-")), "vault.json");
  delete process.env.HATCH_DEMO_MODE;
});

after(() => {
  if (prevKey == null) delete process.env.HATCH_VAULT_KEY;
  else process.env.HATCH_VAULT_KEY = prevKey;
  if (prevPath == null) delete process.env.HATCH_VAULT_PATH;
  else process.env.HATCH_VAULT_PATH = prevPath;
  if (prevDemo == null) delete process.env.HATCH_DEMO_MODE;
  else process.env.HATCH_DEMO_MODE = prevDemo;
});

describe("vault", () => {
  it("stores a secret encrypted and keeps it out of the public record and the scrubbed log", () => {
    const secret = "payroll-secret-9f3a";
    const item = createVaultItem({
      kind: "login",
      name: "Payroll portal",
      whenToUse: "Only when filing payroll, after approval.",
      username: "payroll@firm",
      secret: { password: secret },
    });
    const listed = JSON.stringify(listVaultPublic());
    assert.equal(listed.includes(secret), false);
    assert.equal(listed.includes("ciphertext"), false);
    assert.match(listed, /Payroll portal/);
    const revealed = revealVaultItem(item.id);
    assert.equal(revealed?.secret.password, secret);
    const audit = scrubVaultSecrets(`Approved use of Payroll portal password ${secret}`);
    assert.equal(audit.includes(secret), false);
  });
});

describe("approvals", () => {
  it("drops secret arguments before a card is stored", () => {
    const card = approvalCardForCall(
      {
        name: "use_vault",
        arguments: { itemName: "Payroll portal", password: "payroll-secret-9f3a", purpose: "file payroll" },
      },
      { agentId: "finance", secrets: ["payroll-secret-9f3a"] },
    );
    const raw = JSON.stringify(card);
    assert.equal(raw.includes("payroll-secret-9f3a"), false);
    assert.equal(card.call.arguments.password, undefined);
    assert.equal(card.call.arguments.itemName, "Payroll portal");
    assert.equal(card.status, "pending");
    assert.equal(toolNeedsApproval("search_library"), false);
    assert.equal(toolNeedsApproval("write_draft"), true);
    assert.equal(toolNeedsApproval("use_vault"), true);
  });
});

describe("demo mode", () => {
  it("plans a file-room search and a draft approval without a model", () => {
    assert.equal(demoModeEnabled(), false);
    process.env.HATCH_DEMO_MODE = "1";
    assert.equal(demoModeEnabled(), true);
    const search = planDemoReply({
      query: "How does month-end close run?",
      agentId: "finance",
      sources: [{ file: "Month_end_close.md", room: "finance", snippet: "Finance closes the books on the third business day." }],
    });
    assert.equal(search.tools[0]?.name, "search_library");
    assert.equal(search.approval, undefined);
    assert.match(search.text, /Month_end_close/);
    const draft = planDemoReply({ query: "Draft a close memo", agentId: "finance", sources: [] });
    assert.equal(draft.approval?.tool, "write_draft");
    assert.equal(draft.approval?.status, "pending");
    assert.equal(draft.approval?.call.arguments.departmentId, "finance");
  });
});
