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
  // 'screen-saver' level plus visibleOnFullScreen keeps the cat above full-screen apps.
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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

function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(ROOT, "assets", "walk", "walk_0.png")).resize({ height: 18 });
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  const rebuild = () => {
    const visible = overlay?.isVisible() ?? false;
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: visible ? "Hide cat" : "Show cat",
          click: () => {
            if (visible) overlay?.hide();
            else overlay?.showInactive();
            overlay?.webContents.send("overlay:visible", !visible);
            rebuild();
          },
        },
        { type: "separator" },
        { label: `Quit ${APP_NAME}`, role: "quit" },
      ]),
    );
  };
  rebuild();
}

ipcMain.on("overlay:set-interactive", (_e, interactive: unknown) => {
  overlay?.setIgnoreMouseEvents(interactive !== true, { forward: true });
});
// The renderer pulls bounds at startup; pushed updates can arrive before its listener exists.
ipcMain.handle("overlay:get-bounds", () => rendererBounds());
ipcMain.on("overlay:cat-clicked", () => console.log("[overlay] cat clicked"));

app.whenReady().then(() => {
  app.setName(APP_NAME);
  // Accessory app: no Dock icon, and lets the overlay join full-screen Spaces.
  app.dock?.hide();
  serveAppProtocol();
  createOverlay();
  createTray();
  for (const ev of ["display-added", "display-removed", "display-metrics-changed"] as const) {
    screen.on(ev as "display-added", () => placeOverlay(ev));
  }
});

app.on("window-all-closed", () => app.quit());
