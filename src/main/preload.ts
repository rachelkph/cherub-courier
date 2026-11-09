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
  delivered: () => ipcRenderer.send("cat:delivered"),
});
