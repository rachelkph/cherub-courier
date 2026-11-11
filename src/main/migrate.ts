import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

// The app was called "NewsCat" until 2026-11-11, so its data lived in
// ~/Library/Application Support/NewsCat. On the first launch under the new name,
// copy the app's own files across (not Chromium's caches). The old folder is left
// as it was, so nothing is lost if the copy fails.
export const OLD_DATA_DIR_NAME = "NewsCat";
export const DATA_FILES = ["settings.json", "state.json", "sources-cache.json"];

// Returns the files copied. Does nothing once the new folder has settings.
export function migrateDataDir(oldDir: string, newDir: string): string[] {
  if (oldDir === newDir || !existsSync(oldDir) || existsSync(path.join(newDir, "settings.json"))) return [];
  mkdirSync(newDir, { recursive: true });
  const copied: string[] = [];
  for (const name of DATA_FILES) {
    const from = path.join(oldDir, name);
    const to = path.join(newDir, name);
    if (existsSync(from) && !existsSync(to)) {
      copyFileSync(from, to);
      copied.push(name);
    }
  }
  return copied;
}
