import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("overlay", {
  setInteractive: (interactive: boolean) => ipcRenderer.send("overlay:set-interactive", interactive === true),
  catClicked: () => ipcRenderer.send("overlay:cat-clicked"),
  onBounds: (cb: (b: { width: number; height: number; scale: number }) => void) =>
    ipcRenderer.on("overlay:bounds", (_e, b) => cb(b)),
  onVisible: (cb: (visible: boolean) => void) => ipcRenderer.on("overlay:visible", (_e, v) => cb(v === true)),
});
