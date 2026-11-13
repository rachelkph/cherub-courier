import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateMenuItems } from "../src/main/updateMenu.ts";

describe("update menu", () => {
  it("offers a check when nothing is happening, and says nothing about quiet automatic checks", () => {
    assert.deepEqual(updateMenuItems({ kind: "idle" }), [{ label: "Check for updates", enabled: true, action: "check" }]);
    assert.deepEqual(updateMenuItems({ kind: "current", manual: false }), [{ label: "Check for updates", enabled: true, action: "check" }]);
    assert.deepEqual(updateMenuItems({ kind: "failed", manual: false }), [{ label: "Check for updates", enabled: true, action: "check" }]);
  });
  it("answers a check the user asked for", () => {
    assert.equal(updateMenuItems({ kind: "current", manual: true })[0].label, "You're up to date");
    assert.equal(updateMenuItems({ kind: "failed", manual: true })[0].label, "Couldn't check for updates");
    assert.deepEqual(updateMenuItems({ kind: "checking", manual: true }), [{ label: "Checking for updates…", enabled: false, action: null }]);
  });
  it("shows the download, then offers to restart into the new version", () => {
    assert.deepEqual(updateMenuItems({ kind: "downloading", version: "0.4.1", percent: 41.7 }), [{ label: "Downloading update 0.4.1… 41%", enabled: false, action: null }]);
    assert.deepEqual(updateMenuItems({ kind: "ready", version: "0.4.1" }), [{ label: "Restart to update to 0.4.1", enabled: true, action: "install" }]);
  });
});
