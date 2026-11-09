import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, protocol, screen, Tray } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { APP_NAME, OVERLAY_HEIGHT, SPRITE_SCALE } from "../shared/config";

const ROOT = path.join(__dirname, "..", "..");
// app://newscat/<path> serves only these two directories.
const SERVED_DIRS: Record<string, string> = {
  renderer: path.join(ROOT, "dist", "renderer"),
  assets: path.join(ROOT, "assets"),
};

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
    overlay?.showInactive();
    placeOverlay("initial");
  });
}

function devMenu(): Electron.MenuItemConstructorOptions[] {
  if (app.isPackaged) return [];
  return [
    { type: "separator" },
    {
      label: "Dev",
      submenu: [
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

function rebuildTrayMenu(): void {
  if (!tray) return;
  const visible = overlay?.isVisible() ?? false;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: visible ? "Hide cat" : "Show cat",
        click: () => {
          if (visible) overlay?.hide();
          else overlay?.showInactive();
          overlay?.webContents.send("overlay:visible", !visible);
          rebuildTrayMenu();
        },
      },
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
// The renderer reports the click after the paper toss finishes: the pile is read.
ipcMain.on("cat:delivered", () => setCatState({ unread: 0, editionAge: 0 }));

app.whenReady().then(() => {
  app.setName(APP_NAME);
  // Do not hide the Dock icon: as an accessory app, macOS shows our all-Spaces
  // window over full-screen apps too, which Rachel does not want (tested 2026-11-08).
  catState = devStartState() ?? catState;
  serveAppProtocol();
  createOverlay();
  createTray();
  for (const ev of ["display-added", "display-removed", "display-metrics-changed"] as const) {
    screen.on(ev as "display-added", () => placeOverlay(ev));
  }
});

app.on("window-all-closed", () => app.quit());
