import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { migrateDataDir } from "../src/main/migrate.ts";

async function folders() {
  const root = await mkdtemp(join(tmpdir(), "newscat-migrate-"));
  const oldDir = join(root, "NewsCat");
  const newDir = join(root, "Cherub Courier");
  await mkdir(oldDir);
  return { oldDir, newDir };
}

describe("data folder rename", () => {
  it("copies the app's files from the old folder, leaving caches and the old folder alone", async () => {
    const { oldDir, newDir } = await folders();
    await writeFile(join(oldDir, "settings.json"), '{"a":1}');
    await writeFile(join(oldDir, "state.json"), '{"b":2}');
    await writeFile(join(oldDir, "Preferences"), "chromium");
    assert.deepEqual(migrateDataDir(oldDir, newDir), ["settings.json", "state.json"]);
    assert.equal(readFileSync(join(newDir, "settings.json"), "utf8"), '{"a":1}');
    assert.equal(existsSync(join(newDir, "Preferences")), false);
    assert.equal(existsSync(join(oldDir, "settings.json")), true);
  });

  it("does nothing once the new folder has settings", async () => {
    const { oldDir, newDir } = await folders();
    await writeFile(join(oldDir, "settings.json"), "old");
    await mkdir(newDir);
    await writeFile(join(newDir, "settings.json"), "new");
    assert.deepEqual(migrateDataDir(oldDir, newDir), []);
    assert.equal(readFileSync(join(newDir, "settings.json"), "utf8"), "new");
  });

  it("does nothing without an old folder", async () => {
    const { newDir } = await folders();
    assert.deepEqual(migrateDataDir(join(newDir, "..", "missing"), newDir), []);
    assert.equal(existsSync(newDir), false);
  });
});
