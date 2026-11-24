import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLUGINS, pluginsIn } from "./catalog.ts";

describe("plugin catalog", () => {
  it("wires the mail and file plugins Daniel can use now", () => {
    const wired = new Set(PLUGINS.filter((plugin) => plugin.wired).map((plugin) => plugin.id));
    for (const id of ["gmail", "gdrive", "gcal", "outlook", "onedrive", "outlook-calendar"]) {
      assert.equal(wired.has(id), true, id);
    }
  });

  it("does not pretend SharePoint, Dropbox, Box, or Teams are connected", () => {
    for (const id of ["sharepoint", "dropbox", "box", "teams"]) {
      const plugin = PLUGINS.find((item) => item.id === id);
      assert.equal(plugin?.wired, false);
      assert.equal(plugin?.provider, undefined);
    }
  });

  it("filters by category and search", () => {
    assert.equal(pluginsIn("CRM").length, 0);
    assert.deepEqual(
      pluginsIn("Email", "out").map((plugin) => plugin.id),
      ["outlook"],
    );
  });
});
