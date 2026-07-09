import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),
  platform: process.platform,
});
