import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  net,
  protocol,
  safeStorage,
  session,
  shell,
  type DesktopCapturerSource,
  type IpcMainInvokeEvent,
} from "electron";
import { autoUpdater } from "electron-updater";
import {
  authExchangeResponseSchema,
  authStatusSchema,
  captureSelectionSchema,
  updaterStatusSchema,
  type AuthStatus,
  type UpdaterStatus,
} from "../shared/contracts";
import { findDeepLink, type DesktopDeepLink } from "../shared/security";

const APP_ORIGIN = "janja-app://bundle";
const AUTH_START_URL = "https://janja.live/desktop/auth/start";
const AUTH_EXCHANGE_URL = "https://janja.live/api/desktop/auth/exchange";
const AUTH_SESSION_URL = "https://janja.live/api/desktop/auth/session";
const AUTH_FLOW_TTL_MS = 10 * 60 * 1_000;
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
let authStatus: AuthStatus = { state: "signed-out" };
let sessionToken: string | null = null;
let pendingAuth: { state: string; verifier: string; expiresAt: number } | null = null;
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

function updateAuthStatus(next: AuthStatus) {
  authStatus = authStatusSchema.parse(next);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("auth:status", authStatus);
}

function secretsMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionFilePath() {
  return resolve(app.getPath("userData"), "session.v1");
}

async function persistSession(token: string, expiresAt: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("SECURE_STORAGE_UNAVAILABLE");
  const encrypted = safeStorage.encryptString(JSON.stringify({ token, expiresAt })).toString("base64");
  const target = sessionFilePath();
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, encrypted, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

async function clearStoredSession() {
  sessionToken = null;
  await unlink(sessionFilePath()).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

async function readStoredSession() {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await readFile(sessionFilePath(), "utf8");
    const parsed = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, "base64"))) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as { token?: unknown; expiresAt?: unknown };
    if (
      typeof candidate.token !== "string" ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(candidate.token) ||
      typeof candidate.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(candidate.expiresAt)) ||
      Date.parse(candidate.expiresAt) <= Date.now()
    ) return null;
    return { token: candidate.token, expiresAt: candidate.expiresAt };
  } catch {
    return null;
  }
}

async function fetchAuthenticatedSession(token: string) {
  const response = await net.fetch(AUTH_SESSION_URL, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = await response.json() as { user?: unknown };
  const parsed = authStatusSchema.safeParse({ state: "signed-in", user: payload.user });
  return parsed.success ? parsed.data : null;
}

async function restoreSession() {
  const stored = await readStoredSession();
  if (!stored) {
    await clearStoredSession();
    updateAuthStatus({ state: "signed-out" });
    return;
  }
  const restored = await fetchAuthenticatedSession(stored.token).catch(() => null);
  if (!restored) {
    await clearStoredSession();
    updateAuthStatus({ state: "signed-out" });
    return;
  }
  sessionToken = stored.token;
  updateAuthStatus(restored);
}

async function exchangeAuthCode(link: Extract<DesktopDeepLink, { type: "auth" }>) {
  const pending = pendingAuth;
  pendingAuth = null;
  if (!pending || pending.expiresAt <= Date.now() || !secretsMatch(pending.state, link.state)) {
    updateAuthStatus({ state: "error", message: "Este login expirou. Tente entrar novamente." });
    return;
  }

  updateAuthStatus({ state: "connecting" });
  try {
    const response = await net.fetch(AUTH_EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code: link.code, state: link.state, verifier: pending.verifier }),
    });
    if (!response.ok) throw new Error("AUTH_EXCHANGE_FAILED");
    const exchanged = authExchangeResponseSchema.parse(await response.json());
    await persistSession(exchanged.token, exchanged.expiresAt);
    sessionToken = exchanged.token;
    updateAuthStatus({ state: "signed-in", user: exchanged.user });
  } catch {
    await clearStoredSession();
    updateAuthStatus({ state: "error", message: "Não foi possível conectar sua conta. Tente novamente." });
  }
}

function handleDeepLink(link: DesktopDeepLink | null) {
  if (!link) return;
  if (link.type === "auth") {
    void exchangeAuthCode(link);
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("app:deep-link", link);
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
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
    pendingAuth = { state, verifier, expiresAt: Date.now() + AUTH_FLOW_TTL_MS };
    updateAuthStatus({ state: "connecting" });
    const url = new URL(AUTH_START_URL);
    url.searchParams.set("state", state);
    url.searchParams.set("challenge", challenge);
    await shell.openExternal(url.toString());
  });
  ipcMain.handle("auth:get-status", (event) => {
    assertTrustedSender(event);
    return authStatus;
  });
  ipcMain.handle("auth:logout", async (event) => {
    assertTrustedSender(event);
    const token = sessionToken;
    if (token) {
      await net.fetch(AUTH_SESSION_URL, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      }).catch(() => undefined);
    }
    await clearStoredSession();
    updateAuthStatus({ state: "signed-out" });
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
    handleDeepLink(deepLink);
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
    const initialDeepLink = findDeepLink(process.argv);
    if (initialDeepLink && mainWindow) mainWindow.webContents.once("did-finish-load", () => handleDeepLink(initialDeepLink));
    void restoreSession();
    setTimeout(() => { if (app.isPackaged) void autoUpdater.checkForUpdates(); }, 5_000);
  });

  app.on("window-all-closed", () => app.quit());
}
