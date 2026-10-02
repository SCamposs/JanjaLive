import { contextBridge, ipcRenderer } from "electron";
import type { JanjaDesktopApi, UpdaterStatus } from "../shared/contracts";

const api: JanjaDesktopApi = {
  app: { getVersion: () => ipcRenderer.invoke("app:get-version") },
  capture: {
    listSources: () => ipcRenderer.invoke("capture:list-sources"),
    selectSource: (input) => ipcRenderer.invoke("capture:select-source", input),
    cancelSelection: () => ipcRenderer.invoke("capture:cancel-selection"),
  },
  auth: { start: () => ipcRenderer.invoke("auth:start") },
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    getStatus: () => ipcRenderer.invoke("updater:get-status"),
    restartAndInstall: () => ipcRenderer.invoke("updater:restart-and-install"),
    onStatus(listener) {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdaterStatus) => listener(status);
      ipcRenderer.on("updater:status", handler);
      return () => ipcRenderer.removeListener("updater:status", handler);
    },
  },
};

contextBridge.exposeInMainWorld("janja", api);
