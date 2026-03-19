import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  invoke: (channel: string, args: unknown) => ipcRenderer.invoke(channel, args),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    ipcRenderer.on("window:maximized-changed", (_e, val) => cb(val));
  },
  // Auth
  authSignIn: () => ipcRenderer.invoke("auth:sign-in"),
  authSignOut: () => ipcRenderer.invoke("auth:sign-out"),
  authStatus: () => ipcRenderer.invoke("auth:status"),
  authCompleteSignIn: (data: { strategy: "merge" | "replace" }) =>
    ipcRenderer.invoke("auth:complete-sign-in", data),
  // Sync
  syncNow: () => ipcRenderer.invoke("sync:now"),
  syncStatus: () => ipcRenderer.invoke("sync:status"),
  // Settings
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsUpdate: (data: { cloudServerUrl: string }) =>
    ipcRenderer.invoke("settings:update", data),
});
