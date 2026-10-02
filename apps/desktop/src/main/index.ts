import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  type DesktopCapturerSource,
  type IpcMainInvokeEvent,
} from "electron";
import { autoUpdater } from "electron-updater";
import { captureSelectionSchema, updaterStatusSchema, type UpdaterStatus } from "../shared/contracts";
import { findDeepLink } from "../shared/security";

const APP_ORIGIN = "janja-app://bundle";
const AUTH_START_URL = "https://janja.live/desktop/auth/start";
const SOURCE_TOKEN_TTL_MS = 60_000;
const SELECTION_TTL_MS = 30_000;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const rendererDirectory = resolve(currentDirectory, "../renderer");

protocol.registerSchemesAsPrivileged([
  { scheme: "janja-app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

type SourceGrant = { source: DesktopCapturerSource; ownerId: number; expiresAt: number };
type PendingSelection = SourceGrant & { withSystemAudio: boolean };

let mainWindow: BrowserWindow | null = null;
let updaterStatus: UpdaterStatus = { state: "idle" };
const sourceGrants = new Map<string, SourceGrant>();
const pendingSelections = new Map<number, PendingSelection>();

function rendererUrlIsTrusted(url: string) {
  if (url === `${APP_ORIGIN}/` || url.startsWith(`${APP_ORIGIN}/assets/`)) return true;
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  return !app.isPackaged && Boolean(developmentUrl) && url.startsWith(`${developmentUrl}/`);
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error("UNTRUSTED_IPC_SENDER");
  }
  if (!rendererUrlIsTrusted(event.senderFrame.url)) throw new Error("UNTRUSTED_IPC_ORIGIN");
  return event.sender.id;
}

function updateStatus(next: UpdaterStatus) {
  updaterStatus = updaterStatusSchema.parse(next);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("updater:status", updaterStatus);
}

function sanitizeSourceName(name: string) {
  return name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "Sem título";
}

function registerIpc() {
  ipcMain.handle("app:get-version", (event) => {
    assertTrustedSender(event);
    return app.getVersion();
  });

  ipcMain.handle("capture:list-sources", async (event) => {
    const ownerId = assertTrustedSender(event);
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: false,
    });
    const now = Date.now();
    for (const [token, grant] of sourceGrants) {
      if (grant.ownerId === ownerId || grant.expiresAt <= now) sourceGrants.delete(token);
    }
    return sources.map((source) => {
      const token = randomUUID();
      sourceGrants.set(token, { source, ownerId, expiresAt: now + SOURCE_TOKEN_TTL_MS });
      return {
        token,
        name: sanitizeSourceName(source.name),
        kind: source.id.startsWith("screen:") ? "screen" : "window",
        thumbnailDataUrl: source.thumbnail.toDataURL(),
      };
    });
  });

  ipcMain.handle("capture:select-source", (event, payload: unknown) => {
    const ownerId = assertTrustedSender(event);
    const input = captureSelectionSchema.parse(payload);
    const grant = sourceGrants.get(input.token);
    sourceGrants.delete(input.token);
    if (!grant || grant.ownerId !== ownerId || grant.expiresAt <= Date.now()) throw new Error("CAPTURE_SELECTION_EXPIRED");
    pendingSelections.set(ownerId, { ...grant, withSystemAudio: input.withSystemAudio, expiresAt: Date.now() + SELECTION_TTL_MS });
  });

  ipcMain.handle("capture:cancel-selection", (event) => {
    const ownerId = assertTrustedSender(event);
    pendingSelections.delete(ownerId);
  });

  ipcMain.handle("auth:start", async (event) => {
    assertTrustedSender(event);
    await shell.openExternal(AUTH_START_URL);
  });

  ipcMain.handle("updater:get-status", (event) => {
    assertTrustedSender(event);
    return updaterStatus;
  });
  ipcMain.handle("updater:check", async (event) => {
    assertTrustedSender(event);
    if (!app.isPackaged) return updateStatus({ state: "up-to-date" });
    updateStatus({ state: "checking" });
    await autoUpdater.checkForUpdates();
  });
  ipcMain.handle("updater:restart-and-install", (event) => {
    assertTrustedSender(event);
    if (updaterStatus.state !== "ready") throw new Error("UPDATE_NOT_READY");
    autoUpdater.quitAndInstall(false, true);
  });
}

function configureSession() {
  const activeSession = session.defaultSession;
  activeSession.setPermissionCheckHandler(() => false);
  activeSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  activeSession.setDisplayMediaRequestHandler((request, callback) => {
    const window = mainWindow;
    if (!window || request.frame !== window.webContents.mainFrame || !rendererUrlIsTrusted(request.frame.url)) return callback({});
    const selection = pendingSelections.get(window.webContents.id);
    pendingSelections.delete(window.webContents.id);
    if (!selection || selection.expiresAt <= Date.now()) return callback({});
    callback({ video: selection.source, ...(selection.withSystemAudio ? { audio: "loopback" as const } : {}) });
  });

  activeSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = details.url.startsWith(`${APP_ORIGIN}/`) || details.url.startsWith("https://janja.live/") || details.url.startsWith("https://cdn.discordapp.com/");
    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL && details.url.startsWith(process.env.ELECTRON_RENDERER_URL)) allowed = true;
    if (details.url.startsWith("devtools://") && !app.isPackaged) allowed = true;
    callback({ cancel: !allowed });
  });
  activeSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith(`${APP_ORIGIN}/`)) return callback({ responseHeaders: details.responseHeaders });
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://cdn.discordapp.com; media-src 'self' blob:; connect-src https://janja.live; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
        ],
      },
    });
  });
}

async function registerRendererProtocol() {
  await protocol.handle("janja-app", (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "bundle" || url.username || url.password || url.port || url.search || url.hash) return new Response("Not found", { status: 404 });
      const decodedPath = decodeURIComponent(url.pathname);
      const requestedPath = resolve(rendererDirectory, decodedPath === "/" ? "index.html" : decodedPath.slice(1));
      const relativePath = relative(rendererDirectory, requestedPath);
      if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(requestedPath).toString());
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
    backgroundColor: "#050505",
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolve(currentDirectory, "../preload/index.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!rendererUrlIsTrusted(url)) event.preventDefault();
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  void mainWindow.loadURL(!app.isPackaged && developmentUrl ? developmentUrl : `${APP_ORIGIN}/`);
}

function configureUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("checking-for-update", () => updateStatus({ state: "checking" }));
  autoUpdater.on("update-not-available", () => updateStatus({ state: "up-to-date" }));
  autoUpdater.on("download-progress", ({ percent }) => updateStatus({ state: "downloading", percent: Math.max(0, Math.min(100, percent)) }));
  autoUpdater.on("update-downloaded", ({ version }) => updateStatus({ state: "ready", version }));
  autoUpdater.on("error", () => updateStatus({ state: "error" }));
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deepLink = findDeepLink(argv);
    if (deepLink && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("app:deep-link", deepLink);
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });

  if (process.defaultApp) app.setAsDefaultProtocolClient("janjalive", process.execPath, [resolve(process.argv[1] ?? "")]);
  else app.setAsDefaultProtocolClient("janjalive");

  app.whenReady().then(async () => {
    await registerRendererProtocol();
    configureSession();
    registerIpc();
    configureUpdater();
    createWindow();
    if (findDeepLink(process.argv) && mainWindow) mainWindow.webContents.once("did-finish-load", () => mainWindow?.webContents.send("app:deep-link", findDeepLink(process.argv)));
    setTimeout(() => { if (app.isPackaged) void autoUpdater.checkForUpdates(); }, 5_000);
  });

  app.on("window-all-closed", () => app.quit());
}
