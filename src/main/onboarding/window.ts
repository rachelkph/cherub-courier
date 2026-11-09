// The setup window (first run, and "Set up…" from the menu bar). Sandboxed
// renderer; every IPC call is checked to come from this window's page.

import { BrowserWindow, ipcMain, type IpcMainInvokeEvent, shell } from "electron";
import path from "node:path";
import { APP_NAME } from "../../shared/config.ts";
import type { LinkCheck } from "../sources/discover.ts";
import type { OnboardingModel } from "./model.ts";

const PAGE = "app://newscat/renderer/onboarding/index.html";

export type OnboardingHandlers = {
  model: () => OnboardingModel;
  checkLink: (input: string) => Promise<LinkCheck>;
  finish: (payload: unknown) => Promise<{ fetching: boolean }>;
  skip: () => Promise<void>;
  raterUrls: () => Set<string>; // the only external links this window may open
};

let win: BrowserWindow | null = null;
let handlers: OnboardingHandlers | null = null;

function fromSetup(e: IpcMainInvokeEvent): boolean {
  return win !== null && e.sender === win.webContents && (e.senderFrame?.url ?? "").startsWith("app://newscat/renderer/onboarding/");
}

export function registerOnboardingIpc(h: OnboardingHandlers): void {
  handlers = h;
  const guard =
    <A extends unknown[], R>(fn: (...a: A) => R) =>
    (e: IpcMainInvokeEvent, ...a: A): R => {
      if (!fromSetup(e)) throw new Error("not allowed");
      return fn(...a);
    };
  ipcMain.handle("setup:model", guard(() => (handlers as OnboardingHandlers).model()));
  ipcMain.handle(
    "setup:check-link",
    guard((input: unknown) => (handlers as OnboardingHandlers).checkLink(typeof input === "string" ? input.slice(0, 2048) : "")),
  );
  ipcMain.handle("setup:finish", guard((payload: unknown) => (handlers as OnboardingHandlers).finish(payload)));
  ipcMain.handle("setup:skip", guard(() => (handlers as OnboardingHandlers).skip()));
  ipcMain.handle(
    "setup:open-rater",
    guard((url: unknown) => {
      if (typeof url === "string" && (handlers as OnboardingHandlers).raterUrls().has(url) && url.startsWith("https://")) void shell.openExternal(url);
    }),
  );
  ipcMain.handle("setup:close", guard(() => win?.close()));
}

export function openOnboarding(preloadDir: string): void {
  if (win) {
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 560,
    height: 680,
    resizable: false,
    fullscreenable: false,
    title: `Set up ${APP_NAME}`,
    show: false,
    webPreferences: {
      preload: path.join(preloadDir, "onboardingPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false, // URL and keyword fields
    },
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("console-message", (e) => console.log(`[setup:${e.level}] ${e.message}`));
  win.once("ready-to-show", () => win?.show());
  win.on("closed", () => {
    win = null;
  });
  void win.loadURL(PAGE);
}

export function closeOnboarding(): void {
  win?.close();
}
