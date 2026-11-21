import assert from "node:assert/strict";
import test from "node:test";
import { BOT_ICONS, iconForAgent, isBotIcon } from "./bot-icons.ts";

test("bot icon library covers the role set", () => {
  assert.ok(BOT_ICONS.length >= 40);
  assert.ok(BOT_ICONS.length <= 56);
  assert.equal(BOT_ICONS.filter((icon) => icon.id === "brackets").length, 1);
  assert.equal(isBotIcon("scale"), true);
  assert.equal(isBotIcon("not-an-icon"), false);
});

test("iconForAgent keeps a saved icon and fills role defaults", () => {
  assert.equal(iconForAgent({ icon: "megaphone", name: "Legal" }), "megaphone");
  assert.equal(iconForAgent({ id: "operations", name: "Operations" }), "layers");
  assert.equal(iconForAgent({ id: "legal", name: "Legal" }), "scale");
  assert.equal(iconForAgent({ id: "finance", name: "Finance" }), "trending-up");
  assert.equal(iconForAgent({ id: "general", name: "Hatch" }), "brackets");
  assert.equal(iconForAgent({ name: "Research desk" }), "search");
  assert.equal(iconForAgent({ icon: "legacy-blob", name: "Notes" }), "brackets");
});
