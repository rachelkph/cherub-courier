import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("setup", {
  model: () => ipcRenderer.invoke("setup:model"),
  checkLink: (input: string) => ipcRenderer.invoke("setup:check-link", String(input)),
  finish: (payload: unknown) => ipcRenderer.invoke("setup:finish", payload),
  skip: () => ipcRenderer.invoke("setup:skip"),
  openRater: (url: string) => ipcRenderer.invoke("setup:open-rater", String(url)),
  close: () => ipcRenderer.invoke("setup:close"),
});
