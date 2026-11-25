import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendThreadMessages, patchMessage, removeThreadRecord, updateThread } from "./store.ts";
import {
  createThreadScoped,
  deleteThreadScoped,
  deleteUploadScoped,
  getThreadScoped,
  hydrateUploadsScoped,
  listThreadsScoped,
  loadUploadScoped,
  saveThreadScoped,
  saveUploadScoped,
} from "./thread-store.ts";

let tmpBeta = "";
const prevBeta = process.env.HATCH_BETA_DIR;

beforeEach(() => {
  tmpBeta = mkdtempSync(path.join(os.tmpdir(), "hatch-thread-store-"));
  process.env.HATCH_BETA_DIR = tmpBeta;
});

afterEach(() => {
  if (prevBeta === undefined) delete process.env.HATCH_BETA_DIR;
  else process.env.HATCH_BETA_DIR = prevBeta;
  rmSync(tmpBeta, { recursive: true, force: true });
});

describe("scoped thread and upload persistence", () => {
  it("persists threads across local memory clear (cold start) and isolates scopes", async () => {
    const created = await createThreadScoped("HATCH-AH7G", "north-desk", "Monument sign", "general");
    const updated = appendThreadMessages(created.id, [
      { id: "u1", role: "user", text: "Can you get up to speed on the monument sign?", done: true },
    ]);
    await saveThreadScoped("HATCH-AH7G", updated);

    // Simulate serverless cold start where local store.ts no longer has the thread
    removeThreadRecord(created.id);

    const reloaded = await getThreadScoped("HATCH-AH7G", created.id);
    assert.ok(reloaded);
    assert.equal(reloaded.messages.length, 1);
    assert.equal(reloaded.messages[0].text, "Can you get up to speed on the monument sign?");

    // Patch reaction and persist
    patchMessage(created.id, "u1", { reactions: ["👍"] });
    const renamed = updateThread(created.id, { title: "Little Elm Monument Sign" });
    await saveThreadScoped("HATCH-AH7G", renamed);

    const listA = await listThreadsScoped("HATCH-AH7G");
    assert.ok(listA.some((t) => t.id === created.id && t.title === "Little Elm Monument Sign"));

    // Different scope must not see HATCH-AH7G's thread from beta-store
    removeThreadRecord(created.id);
    const listB = await listThreadsScoped("OTHER-SCOPE");
    assert.equal(listB.some((t) => t.id === created.id), false);

    // Delete removes it from both stores
    const deleted = await deleteThreadScoped("HATCH-AH7G", created.id);
    assert.equal(deleted, true);
    const afterDelete = await getThreadScoped("HATCH-AH7G", created.id);
    assert.equal(afterDelete, null);
  });

  it("persists uploaded file metadata, extracted text, and bytes across cold starts", async () => {
    const file = {
      id: "up-test-1",
      name: "Monument_Sign_Notes.txt",
      kind: "Markdown" as const,
      status: "ready" as const,
      progress: 100,
      departmentId: "north-desk",
      roomId: "north-desk",
      folderId: null,
      inLibrary: true,
      origin: "upload" as const,
    };
    const body = "Variance approved Nov 18. Waiting on stamped footing PDF from Apex Signs.";
    await saveUploadScoped("HATCH-AH7G", file, body, Buffer.from(body, "utf8"));

    const loaded = await loadUploadScoped("HATCH-AH7G", file.id);
    assert.ok(loaded);
    assert.equal(loaded.file.name, "Monument_Sign_Notes.txt");
    assert.match(loaded.text, /Variance approved Nov 18/);

    const listed = await hydrateUploadsScoped("HATCH-AH7G", "north-desk");
    assert.ok(listed.some((f) => f.id === file.id));

    await deleteUploadScoped("HATCH-AH7G", "north-desk", file.id);
    const after = await loadUploadScoped("HATCH-AH7G", file.id);
    assert.equal(after, null);
  });
});
