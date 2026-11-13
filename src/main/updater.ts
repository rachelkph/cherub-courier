// Automatic updates (Rachel chose these, 2026-11-12): the packaged app checks the
// newest GitHub release (latest-mac.yml) at launch and every few hours, downloads a
// newer version in the background, and installs it when the app quits, or at once
// from "Restart to update". macOS only installs an update signed by the same
// Developer ID. Development builds never check.

import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateState } from "./updateMenu.ts";

const FIRST_CHECK_MS = 30_000; // let launch settle (and the network come up) first
const EVERY_MS = 6 * 60 * 60_000;

let state: UpdateState = { kind: "idle" };
let manual = false;
let onChange: () => void = () => {};

function set(next: UpdateState): void {
  state = next;
  onChange();
}

export function updateState(): UpdateState {
  return state;
}

export function checkForUpdates(byUser: boolean): void {
  if (!app.isPackaged || state.kind === "checking" || state.kind === "downloading" || state.kind === "ready") return;
  manual = byUser;
  set({ kind: "checking", manual });
  autoUpdater.checkForUpdates().catch((e: unknown) => {
    console.log("[update] check failed:", e instanceof Error ? e.message : e);
    set({ kind: "failed", manual });
  });
}

export function installUpdate(): void {
  if (state.kind === "ready") autoUpdater.quitAndInstall(false, true);
}

export function startUpdater(changed: () => void): void {
  onChange = changed;
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;
  autoUpdater.on("update-available", (info) => {
    console.log("[update] downloading", info.version);
    set({ kind: "downloading", version: info.version, percent: 0 });
  });
  autoUpdater.on("download-progress", (p) => {
    if (state.kind === "downloading") set({ ...state, percent: p.percent });
  });
  autoUpdater.on("update-downloaded", (info) => {
    console.log("[update] ready", info.version);
    set({ kind: "ready", version: info.version });
  });
  autoUpdater.on("update-not-available", () => set({ kind: "current", manual }));
  autoUpdater.on("error", (e) => {
    console.log("[update] error:", e?.message ?? e);
    if (state.kind !== "ready") set({ kind: "failed", manual });
  });
  setTimeout(() => checkForUpdates(false), FIRST_CHECK_MS);
  setInterval(() => checkForUpdates(false), EVERY_MS);
}
