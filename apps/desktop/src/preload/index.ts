import { contextBridge, ipcRenderer } from "electron";
import type { AuthStatus, JanjaDesktopApi, UpdaterStatus } from "../shared/contracts";

const api: JanjaDesktopApi = {
  app: {
    getVersion: () => ipcRenderer.invoke("app:get-version"),
    onRoomInvite(listener) {
      const handler = (_event: Electron.IpcRendererEvent, link: unknown) => {
        if (
          link && typeof link === "object" &&
          (link as { type?: unknown }).type === "room" &&
          typeof (link as { roomToken?: unknown }).roomToken === "string"
        ) listener((link as { roomToken: string }).roomToken);
      };
      ipcRenderer.on("app:deep-link", handler);
      return () => ipcRenderer.removeListener("app:deep-link", handler);
    },
  },
  capture: {
    listSources: () => ipcRenderer.invoke("capture:list-sources"),
    selectSource: (input) => ipcRenderer.invoke("capture:select-source", input),
    cancelSelection: () => ipcRenderer.invoke("capture:cancel-selection"),
  },
  auth: {
    start: () => ipcRenderer.invoke("auth:start"),
    getStatus: () => ipcRenderer.invoke("auth:get-status"),
    logout: () => ipcRenderer.invoke("auth:logout"),
    onStatus(listener) {
      const handler = (_event: Electron.IpcRendererEvent, status: AuthStatus) => listener(status);
      ipcRenderer.on("auth:status", handler);
      return () => ipcRenderer.removeListener("auth:status", handler);
    },
  },
  rooms: {
    list: () => ipcRenderer.invoke("rooms:list"),
    get: (roomId) => ipcRenderer.invoke("rooms:get", roomId),
    getPublic: (publicId) => ipcRenderer.invoke("rooms:get-public", publicId),
    create: (input) => ipcRenderer.invoke("rooms:create", input),
    joinCode: (code) => ipcRenderer.invoke("rooms:join-code", code),
    openInvite: (token) => ipcRenderer.invoke("rooms:open-invite", token),
    requestAccess: (roomId) => ipcRenderer.invoke("rooms:request-access", roomId),
    manageMember: (roomId, input) => ipcRenderer.invoke("rooms:manage-member", roomId, input),
    copyCode: (code) => ipcRenderer.invoke("rooms:copy-code", code),
    copyInvite: (roomId) => ipcRenderer.invoke("rooms:copy-invite", roomId),
    delete: (roomId) => ipcRenderer.invoke("rooms:delete", roomId),
  },
  realtime: {
    poll: (roomId, since) => ipcRenderer.invoke("realtime:poll", roomId, since),
    send: (roomId, signal) => ipcRenderer.invoke("realtime:send", roomId, signal),
    getIceServers: (roomId) => ipcRenderer.invoke("realtime:ice-servers", roomId),
  },
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
