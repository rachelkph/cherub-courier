import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, powerMonitor, protocol, screen, shell, Tray } from "electron";
import { rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_NAME, OVERLAY_HEIGHT, SOURCES_REMOTE_URL, SPRITE_SCALE } from "../shared/config.ts";
import { realDeps } from "./feeds/client.ts";
import { buildEdition } from "./feeds/edition.ts";
import { safeUrl } from "./feeds/sanitize.ts";
import { urlKey } from "./feeds/select.ts";
import { emptyState, loadState, readJsonOrSetAside, type State, saveState, writeJsonAtomic } from "./feeds/store.ts";
import { applyFinish, applySkip, buildModel, type VerifiedFeeds } from "./onboarding/model.ts";
import { closeOnboarding, openOnboarding, registerOnboardingIpc } from "./onboarding/window.ts";
import { buildView, catInputs, clearPile, markOpened } from "./popover/view.ts";
import { hidePopover, isPopoverVisible, preparePopover, pushPopoverView, registerPopoverIpc, showPopover } from "./popover/window.ts";
import { currentEdition, snoozeEnd } from "./schedule.ts";
import { Scheduler } from "./scheduler.ts";
import { cleanSettings, defaultSettings, editionSources, loadSettings, type Settings, saveSettings } from "./settings.ts";
import { checkLink } from "./sources/discover.ts";
import { cleanRemoteCache, loadSources } from "./sources/load.ts";
import type { SourcesFile } from "./sources/schema.ts";

const ROOT = path.join(__dirname, "..", "..");
// app://newscat/<path> serves only these two directories.
const SERVED_DIRS: Record<string, string> = {
  renderer: path.join(ROOT, "dist", "renderer"),
  assets: path.join(ROOT, "assets"),
};

// Dev only: run against a separate data folder (testing without touching real data).
if (!app.isPackaged && process.env.NEWSCAT_USER_DATA) app.setPath("userData", process.env.NEWSCAT_USER_DATA);

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;

// What the cat knows: unread headlines and how many editions old the oldest one is.
// The feed engine (M2) and scheduler (M5) will own this; until then the dev menu sets it.
type CatState = { unread: number; editionAge: number };
let catState: CatState = { unread: 0, editionAge: 0 };

// Dev only: NEWSCAT_DEV_STATE="unread,editionAge" sets the starting state.
function devStartState(): CatState | null {
  const raw = process.env.NEWSCAT_DEV_STATE;
  if (app.isPackaged || !raw) return null;
  const [unread, editionAge] = raw.split(",").map((n) => Number.parseInt(n, 10));
  return Number.isFinite(unread) && Number.isFinite(editionAge) ? { unread, editionAge } : null;
}

function setCatState(next: CatState): void {
  catState = next;
  overlay?.webContents.send("cat:state", catState);
  rebuildTrayMenu();
}

function serveAppProtocol(): void {
  protocol.handle("app", (req) => {
    const { host, pathname } = new URL(req.url);
    const [dir, ...rest] = decodeURIComponent(pathname).split("/").filter(Boolean);
    const base = SERVED_DIRS[dir];
    const target = base && path.resolve(base, ...rest);
    if (host !== "newscat" || !target || !target.startsWith(base + path.sep)) {
      return new Response("not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

// The strip sits on the bottom edge of the main display's usable area,
// so it clears a bottom Dock and ignores side Docks.
function overlayBounds(): Electron.Rectangle {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x,
    y: workArea.y + workArea.height - OVERLAY_HEIGHT,
    width: workArea.width,
    height: OVERLAY_HEIGHT,
  };
}

function rendererBounds() {
  const b = overlayBounds();
  return { width: b.width, height: b.height, scale: SPRITE_SCALE };
}

function placeOverlay(reason: string): void {
  if (!overlay) return;
  const b = overlayBounds();
  overlay.setBounds(b);
  overlay.webContents.send("overlay:bounds", rendererBounds());
  console.log(`[overlay] placed (${reason})`, b);
}

function createOverlay(): void {
  overlay = new BrowserWindow({
    ...overlayBounds(),
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 'floating' sits above normal windows but below the Dock, so a revealed or
  // magnified Dock covers the cat. Not joining full-screen Spaces hides the cat
  // over full-screen apps (Rachel's decision, 2026-11-08).
  overlay.setAlwaysOnTop(true, "floating");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  overlay.setIgnoreMouseEvents(true, { forward: true });

  // No navigation or new windows, ever.
  overlay.webContents.on("will-navigate", (e) => e.preventDefault());
  overlay.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Surface renderer logs and errors in the terminal during development.
  overlay.webContents.on("console-message", (e) => console.log(`[renderer:${e.level}] ${e.message}`));
  overlay.webContents.on("render-process-gone", (_e, d) => console.log("[renderer] gone", d));

  overlay.loadURL("app://newscat/renderer/index.html");
  overlay.once("ready-to-show", () => {
    placeOverlay("initial");
    applyVisibility(); // shows the cat unless hidden or snoozed
  });
}

// --- data: sources list, settings ----------------------------------------------

function dataPaths() {
  const dir = app.getPath("userData");
  return {
    state: path.join(dir, "state.json"),
    settings: path.join(dir, "settings.json"),
    sourcesCache: path.join(dir, "sources-cache.json"),
  };
}

let sourcesFile: SourcesFile;
let settings: Settings;
let state: State = emptyState(); // editions, read state, feed caches (state.json)
const verifiedFeeds: VerifiedFeeds = new Map(); // pasted feeds checked this session

async function loadSourcesList(allowNetwork: boolean): Promise<void> {
  const remote = cleanRemoteCache(await readJsonOrSetAside(dataPaths().sourcesCache));
  const loaded = await loadSources({ bundledPath: path.join(ROOT, "data", "sources.json"), remoteUrl: SOURCES_REMOTE_URL, remote, deps: realDeps, allowNetwork });
  if (allowNetwork) await writeJsonAtomic(dataPaths().sourcesCache, loaded.remote);
  sourcesFile = loaded.file;
  console.log(`[sources] ${sourcesFile.sources.length} sources (${loaded.origin} copy, reviewed ${sourcesFile.lastReviewed})${loaded.note ? `; ${loaded.note}` : ""}`);
}

function applyLoginItem(): void {
  // In development this would register the bare Electron binary, so only packaged builds do it.
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
  else console.log(`[login] start at login = ${settings.launchAtLogin} (applied only in packaged builds)`);
}

// --- editions (fetched on demand until the scheduler in M5) -------------------------

let fetching = false;
let refreshing = false;

// The cat shows what is stored: unread pile size and how old it is.
function updateCat(): void {
  setCatState(catInputs(state, Date.now()));
}

async function saveAndShow(next: State): Promise<void> {
  state = next;
  await saveState(dataPaths().state, state);
  updateCat();
  pushPopoverView(popoverView());
}

// "failed" = every feed errored (offline): nothing is saved, so the edition is
// retried rather than recorded as delivered-and-empty. Never shown as an error.
async function fetchEdition(force: boolean): Promise<"ok" | "failed"> {
  if (fetching) return "ok";
  const sources = editionSources(settings, sourcesFile);
  if (sources.length === 0) {
    console.log("[feeds] no approved sources; nothing to fetch");
    return "ok";
  }
  fetching = true;
  try {
    const now = Date.now();
    const { slot, scheduledFor } = currentEdition(now, settings.editionTimes);
    const out = await buildEdition({ sources, topics: settings.topics, keywords: settings.keywords, slot, scheduledFor, force }, state, realDeps);
    for (const f of out.feeds) if (f.error) console.log(`[feeds] ${f.id}: ${f.result} ${f.error}`);
    if (out.feeds.every((f) => f.result === "error")) {
      console.log(`[feeds] ${out.edition.id}: every feed failed; not saved, will retry`);
      return "failed";
    }
    console.log(`[feeds] ${out.edition.id}: ${out.edition.items.length} headlines from ${sources.length} sources`);
    await saveAndShow(out.state);
    return "ok";
  } catch (e) {
    console.error("[feeds] edition failed", e);
    return "failed";
  } finally {
    fetching = false;
  }
}

const scheduler = new Scheduler({
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
  times: () => settings.editionTimes,
  newestEditionFor: () => (state.editions.length ? Math.max(...state.editions.map((e) => e.scheduledFor)) : null),
  lastFetchAt: () => (state.editions.length ? Math.max(...state.editions.map((e) => e.fetchedAt)) : null),
  run: () => fetchEdition(false),
  log: (m) => console.log(m),
});

// --- hide and snooze -------------------------------------------------------------

let hiddenByUser = false;
let snoozeTimer: NodeJS.Timeout | undefined;

// The cat is shown unless the user hid him or he is snoozed. Snoozing hides him;
// editions are still fetched, and the pile is there when he comes back.
function applyVisibility(): void {
  clearTimeout(snoozeTimer);
  const now = Date.now();
  const snoozed = settings.snoozeUntil > now;
  if (snoozed) snoozeTimer = setTimeout(applyVisibility, Math.min(settings.snoozeUntil - now + 500, 2 ** 31 - 1));
  else if (settings.snoozeUntil !== 0) {
    settings = { ...settings, snoozeUntil: 0 };
    void saveSettings(dataPaths().settings, settings);
  }
  const visible = !hiddenByUser && !snoozed;
  if (overlay) {
    if (visible && !overlay.isVisible()) overlay.showInactive();
    if (!visible && overlay.isVisible()) overlay.hide();
    overlay.webContents.send("overlay:visible", visible);
  }
  if (!visible) hidePopover();
  rebuildTrayMenu();
}

function snooze(until: number): void {
  settings = { ...settings, snoozeUntil: until };
  void saveSettings(dataPaths().settings, settings);
  applyVisibility();
}

// --- popover -------------------------------------------------------------------

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function popoverView() {
  const labels = new Map(sourcesFile.topics.map((t) => [t.id, t.label]));
  return buildView(state, {
    now: Date.now(),
    topics: settings.topics.map((id) => ({ id, label: labels.get(id) ?? id })),
    filter: settings.popoverFilter,
    editionTimes: settings.editionTimes,
    hasSources: editionSources(settings, sourcesFile).length > 0,
    refreshing,
    clock,
  });
}

// The overlay sends the cat's box in its own CSS px; convert to screen points.
function catOnScreen(box: unknown): { x: number; y: number; width: number; height: number } | null {
  if (!overlay || typeof box !== "object" || box === null) return null;
  const b = box as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const [x, y, width, height] = [n(b.x), n(b.y), n(b.width), n(b.height)];
  if (x === null || y === null || width === null || height === null) return null;
  const o = overlay.getBounds();
  return { x: o.x + x, y: o.y + y, width, height };
}

registerPopoverIpc({
  view: popoverView,
  open: (key) => {
    const item = state.editions.flatMap((e) => e.items).find((i) => urlKey(i.link) === key);
    const link = item ? safeUrl(item.link) : null;
    if (!link) return;
    void shell.openExternal(link);
    void saveAndShow(markOpened(state, key, Date.now()));
  },
  filter: (id) => {
    settings = cleanSettings({ ...settings, popoverFilter: id }, sourcesFile);
    void saveSettings(dataPaths().settings, settings);
    pushPopoverView(popoverView());
  },
  refresh: () => {
    if (refreshing) return;
    refreshing = true;
    pushPopoverView(popoverView());
    void fetchEdition(true).finally(() => {
      refreshing = false;
      pushPopoverView(popoverView());
    });
  },
  settings: () => {
    hidePopover();
    openOnboarding(__dirname);
  },
  visibility: (visible) => overlay?.webContents.send("popover:visible", visible),
});

// Click with no pile: open or close the popover.
ipcMain.on("cat:clicked", (e, box: unknown) => {
  if (e.sender !== overlay?.webContents) return;
  if (isPopoverVisible()) return hidePopover();
  const cat = catOnScreen(box);
  if (cat) showPopover(__dirname, cat);
});
// Click with a pile: after the paper toss, the pile is read and the popover opens.
ipcMain.on("cat:delivered", (e, box: unknown) => {
  if (e.sender !== overlay?.webContents) return;
  void saveAndShow(clearPile(state, Date.now()));
  const cat = catOnScreen(box);
  if (cat) showPopover(__dirname, cat);
});

// --- setup window ------------------------------------------------------------

registerOnboardingIpc({
  model: () => buildModel(sourcesFile, settings),
  checkLink: async (input) => {
    const result = await checkLink(input, realDeps);
    if (result.kind === "feed") verifiedFeeds.set(result.feedUrl, { title: result.title });
    return result;
  },
  finish: async (payload) => {
    settings = applyFinish(payload, sourcesFile, settings, verifiedFeeds);
    await saveSettings(dataPaths().settings, settings);
    applyLoginItem();
    const fetchingNow = editionSources(settings, sourcesFile).length > 0;
    if (fetchingNow) void fetchEdition(true).then(() => scheduler.check("settings"));
    return { fetching: fetchingNow };
  },
  skip: async () => {
    settings = applySkip(settings);
    await saveSettings(dataPaths().settings, settings);
    applyLoginItem();
  },
  raterUrls: () => new Set(sourcesFile.sources.flatMap((s) => s.ratings.map((r) => r.evidenceUrl))),
});

async function resetEverything(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: "warning",
    message: `Reset ${APP_NAME}?`,
    detail: "This deletes your topics, sources, settings and saved headlines from this Mac, then opens setup again.",
    buttons: ["Reset", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return;
  closeOnboarding();
  const p = dataPaths();
  await Promise.all([p.state, p.settings, p.sourcesCache].map((f) => rm(f, { force: true })));
  verifiedFeeds.clear();
  settings = defaultSettings();
  state = emptyState();
  hidePopover();
  applyLoginItem();
  setCatState({ unread: 0, editionAge: 0 });
  openOnboarding(__dirname);
}

function devMenu(): Electron.MenuItemConstructorOptions[] {
  if (app.isPackaged) return [];
  return [
    { type: "separator" },
    {
      label: "Dev",
      submenu: [
        { label: "Fetch edition now", click: () => void fetchEdition(true) },
        { type: "separator" },
        {
          label: "Unread headlines",
          submenu: [0, 1, 3, 5, 7, 9, 12].map((n) => ({
            label: String(n),
            type: "radio" as const,
            checked: catState.unread === n,
            click: () => setCatState({ ...catState, unread: n }),
          })),
        },
        {
          label: "Oldest unread edition age",
          submenu: [0, 1, 2, 3].map((n) => ({
            label: n === 0 ? "0 (latest)" : `${n} edition${n > 1 ? "s" : ""} old`,
            type: "radio" as const,
            checked: catState.editionAge === n,
            click: () => setCatState({ ...catState, editionAge: n }),
          })),
        },
      ],
    },
  ];
}

function snoozeMenu(): Electron.MenuItemConstructorOptions[] {
  if (settings.snoozeUntil > Date.now()) {
    const until = new Date(settings.snoozeUntil);
    const sameDay = until.toDateString() === new Date().toDateString();
    const when = `${sameDay ? "" : "tomorrow "}${clock(settings.snoozeUntil)}`;
    return [{ label: `Snoozed until ${when}`, enabled: false }, { label: "Wake the cat now", click: () => snooze(0) }];
  }
  return [
    {
      label: "Snooze",
      submenu: [
        { label: "For 1 hour", click: () => snooze(snoozeEnd("hour", Date.now(), settings.editionTimes)) },
        { label: "Until tomorrow morning", click: () => snooze(snoozeEnd("tomorrow", Date.now(), settings.editionTimes)) },
      ],
    },
  ];
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: hiddenByUser ? "Show cat" : "Hide cat",
        click: () => {
          hiddenByUser = !hiddenByUser;
          applyVisibility();
        },
      },
      ...snoozeMenu(),
      { type: "separator" },
      { label: "Set up…", click: () => openOnboarding(__dirname) },
      { label: "Reset everything…", click: () => void resetEverything() },
      ...devMenu(),
      { type: "separator" },
      { label: `Quit ${APP_NAME}`, role: "quit" },
    ]),
  );
}

function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(ROOT, "assets", "walk", "walk_0.png")).resize({ height: 18 });
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  rebuildTrayMenu();
}

ipcMain.on("overlay:set-interactive", (_e, interactive: unknown) => {
  overlay?.setIgnoreMouseEvents(interactive !== true, { forward: true });
});
// The renderer pulls bounds at startup; pushed updates can arrive before its listener exists.
ipcMain.handle("overlay:get-bounds", () => rendererBounds());
ipcMain.handle("cat:get-state", () => catState);


app.whenReady().then(async () => {
  app.setName(APP_NAME);
  // Do not hide the Dock icon: as an accessory app, macOS shows our all-Spaces
  // window over full-screen apps too, which Rachel does not want (tested 2026-11-08).
  serveAppProtocol();
  await loadSourcesList(false);
  settings = await loadSettings(dataPaths().settings, sourcesFile);
  state = await loadState(dataPaths().state);
  catState = devStartState() ?? catInputs(state, Date.now());
  createOverlay();
  createTray();
  if (!settings.onboarded) openOnboarding(__dirname);
  preparePopover(__dirname);
  // Unread headlines expire after 48h and the cat gets sleepier as editions pass.
  setInterval(updateCat, 10 * 60_000);
  applyVisibility();
  // Editions at the user's times, catch-up after sleep, and a fetch on launch if stale.
  void scheduler.start();
  for (const ev of ["resume", "unlock-screen"] as const) {
    powerMonitor.on(ev as "resume", () => {
      updateCat();
      void scheduler.check("wake");
    });
  }
  // Check for a newer sources list in the background; used from the next launch or setup.
  void loadSourcesList(true)
    .then(() => {
      settings = cleanSettings(settings, sourcesFile);
    })
    .catch((e) => console.error("[sources] refresh failed", e));
  if (!app.isPackaged && process.env.NEWSCAT_DEV_FETCH === "1") void fetchEdition(true);
  for (const ev of ["display-added", "display-removed", "display-metrics-changed"] as const) {
    screen.on(ev as "display-added", () => placeOverlay(ev));
  }
});

app.on("window-all-closed", () => app.quit());
