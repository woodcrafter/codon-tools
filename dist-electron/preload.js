// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  platform: process.platform
});
