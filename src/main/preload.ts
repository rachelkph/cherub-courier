import { contextBridge, ipcRenderer } from "electron";

type Bounds = { width: number; height: number; scale: number };
type CatState = { unread: number; editionAge: number };

contextBridge.exposeInMainWorld("overlay", {
  setInteractive: (interactive: boolean) => ipcRenderer.send("overlay:set-interactive", interactive === true),
  getBounds: (): Promise<Bounds> => ipcRenderer.invoke("overlay:get-bounds"),
  onBounds: (cb: (b: Bounds) => void) => ipcRenderer.on("overlay:bounds", (_e, b) => cb(b)),
  onVisible: (cb: (visible: boolean) => void) => ipcRenderer.on("overlay:visible", (_e, v) => cb(v === true)),
  getCatState: (): Promise<CatState> => ipcRenderer.invoke("cat:get-state"),
  onCatState: (cb: (s: CatState) => void) => ipcRenderer.on("cat:state", (_e, s) => cb(s)),
  // The cat's box in CSS px inside the overlay window, so main can anchor the popover.
  clicked: (box: { x: number; y: number; width: number; height: number }) => ipcRenderer.send("cat:clicked", box),
  delivered: (box: { x: number; y: number; width: number; height: number }) => ipcRenderer.send("cat:delivered", box),
  onPopoverVisible: (cb: (visible: boolean) => void) => ipcRenderer.on("popover:visible", (_e, v) => cb(v === true)),
  // Paused from the menu bar: he stays where he is.
  getPaused: (): Promise<boolean> => ipcRenderer.invoke("overlay:get-paused"),
  onPaused: (cb: (paused: boolean) => void) => ipcRenderer.on("overlay:paused", (_e, v) => cb(v === true)),
  // Put to sleep from the menu bar.
  getSleeping: (): Promise<boolean> => ipcRenderer.invoke("overlay:get-sleeping"),
  onSleeping: (cb: (sleeping: boolean) => void) => ipcRenderer.on("overlay:sleeping", (_e, v) => cb(v === true)),
});
