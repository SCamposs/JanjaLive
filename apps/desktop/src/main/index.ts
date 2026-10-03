import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
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
import electronUpdater from "electron-updater";
import {
  authExchangeResponseSchema,
  authStatusSchema,
  clientSignalSchema,
  captureSelectionSchema,
  iceServersSchema,
  membershipActionSchema,
  realtimePollSchema,
  roomCreateInputSchema,
  roomSnapshotSchema,
  roomSummarySchema,
  updaterStatusSchema,
  type AuthStatus,
  type UpdaterStatus,
} from "../shared/contracts";
import { findDeepLink, type DesktopDeepLink } from "../shared/security";
import { ExpiringGrantStore } from "../shared/expiring-grants";

const { autoUpdater } = electronUpdater;

const APP_ORIGIN = "janja-app://bundle";
const API_ORIGIN = "https://janja.live";
const AUTH_START_URL = "https://janja.live/desktop/auth/start";
const AUTH_EXCHANGE_URL = "https://janja.live/api/desktop/auth/exchange";
const AUTH_POLL_URL = "https://janja.live/api/desktop/auth/poll";
const AUTH_SESSION_URL = "https://janja.live/api/desktop/auth/session";
const AUTH_FLOW_TTL_MS = 10 * 60 * 1_000;
const SOURCE_TOKEN_TTL_MS = 60_000;
const SELECTION_TTL_MS = 30_000;
const AUDIO_FALLBACK_TTL_MS = 5_000;
const isPackagedSmokeTest = process.argv.includes("--janjalive-smoke-test");
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const rendererDirectory = resolve(currentDirectory, "../renderer");

protocol.registerSchemesAsPrivileged([
  { scheme: "janja-app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

type SourceGrant = { source: DesktopCapturerSource; ownerId: number; expiresAt: number };
type PendingSelection = SourceGrant & { withSystemAudio: boolean };
type PendingAuth = { state: string; verifier: string; expiresAt: number };

let mainWindow: BrowserWindow | null = null;
let updaterStatus: UpdaterStatus = { state: "idle" };
let updateRequired = false;
let authStatus: AuthStatus = { state: "signed-out" };
let sessionToken: string | null = null;
let pendingAuth: PendingAuth | null = null;
let authExchangeInFlight: Promise<"pending" | "complete"> | null = null;
const sourceGrants = new ExpiringGrantStore<DesktopCapturerSource>();
const pendingSelections = new Map<number, PendingSelection>();
const audioFallbackSelections = new Map<number, SourceGrant>();

const rendererContentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

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
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "X-JanjaLive-Desktop-Version": app.getVersion(),
    },
  });
  if (response.status === 426) {
    updateRequired = true;
    updateStatus({ state: "required" });
  }
  if (!response.ok) return null;
  const payload = await response.json() as { user?: unknown };
  const parsed = authStatusSchema.safeParse({ state: "signed-in", user: payload.user });
  return parsed.success ? parsed.data : null;
}

async function restoreSession() {
  const stored = await readStoredSession();
  if (!stored) {
    await clearStoredSession();
    if (!pendingAuth) updateAuthStatus({ state: "signed-out" });
    return;
  }
  const restored = await fetchAuthenticatedSession(stored.token).catch(() => null);
  if (!restored) {
    await clearStoredSession();
    if (!pendingAuth) updateAuthStatus({ state: "signed-out" });
    return;
  }
  sessionToken = stored.token;
  updateAuthStatus(restored);
}

async function attemptAuthExchange(flow: PendingAuth, code?: string) {
  if (authExchangeInFlight) return authExchangeInFlight;
  const attempt = (async (): Promise<"pending" | "complete"> => {
    if (pendingAuth !== flow || flow.expiresAt <= Date.now()) return "pending";
    const response = await net.fetch(code ? AUTH_EXCHANGE_URL : AUTH_POLL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...(code ? { code } : {}), state: flow.state, verifier: flow.verifier }),
    });
    if (!code && response.status === 202) return "pending";
    if (!response.ok) throw new Error("AUTH_EXCHANGE_FAILED");
    const exchanged = authExchangeResponseSchema.parse(await response.json());
    if (pendingAuth !== flow) return "pending";
    await persistSession(exchanged.token, exchanged.expiresAt);
    pendingAuth = null;
    sessionToken = exchanged.token;
    updateAuthStatus({ state: "signed-in", user: exchanged.user });
    return "complete";
  })();
  authExchangeInFlight = attempt;
  try {
    return await attempt;
  } finally {
    if (authExchangeInFlight === attempt) authExchangeInFlight = null;
  }
}

async function pollAuthFlow(flow: PendingAuth) {
  while (pendingAuth === flow && Date.now() < flow.expiresAt) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
    if (pendingAuth !== flow) return;
    try {
      if (await attemptAuthExchange(flow) === "complete") return;
    } catch {
      // The browser may still be authenticating or the network may be temporarily unavailable.
    }
  }
  if (pendingAuth === flow) {
    pendingAuth = null;
    updateAuthStatus({ state: "error", message: "Este login expirou. Tente entrar novamente." });
  }
}

async function exchangeAuthCode(link: Extract<DesktopDeepLink, { type: "auth" }>) {
  const flow = pendingAuth;
  if (!flow || flow.expiresAt <= Date.now() || !secretsMatch(flow.state, link.state)) return;
  try {
    await attemptAuthExchange(flow, link.code);
  } catch {
    // Polling remains active as a fallback when a browser does not complete the deep-link handoff.
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

function assertRoomId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("INVALID_ROOM_ID");
  }
  return value;
}

async function backendRequest(pathname: string, init: RequestInit = {}) {
  if (!sessionToken) throw new Error("UNAUTHENTICATED");
  const url = new URL(pathname, API_ORIGIN);
  if (url.origin !== API_ORIGIN || !url.pathname.startsWith("/api/")) throw new Error("INVALID_API_PATH");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${sessionToken}`);
  headers.set("X-JanjaLive-Desktop-Version", app.getVersion());
  headers.set("Accept", "application/json");
  const response = await net.fetch(url.toString(), { ...init, headers });
  if (response.status === 401) {
    await clearStoredSession();
    updateAuthStatus({ state: "signed-out" });
  }
  if (response.status === 426) {
    updateRequired = true;
    updateStatus({ state: "required" });
  }
  if (!response.ok) throw new Error(`API_${response.status}`);
  return response;
}

async function getRoomSnapshot(roomId: string) {
  const response = await backendRequest(`/api/rooms/${encodeURIComponent(assertRoomId(roomId))}`);
  return roomSnapshotSchema.parse(await response.json());
}

async function openInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(token)) throw new Error("INVALID_INVITE");
  const response = await backendRequest("/api/rooms/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return roomSnapshotSchema.parse(await response.json());
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
    sourceGrants.clearOwner(ownerId, now);
    return sources.map((source) => {
      const token = randomUUID();
      sourceGrants.set(token, { value: source, ownerId, expiresAt: now + SOURCE_TOKEN_TTL_MS });
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
    const source = sourceGrants.take(input.token, ownerId);
    if (!source) throw new Error("CAPTURE_SELECTION_EXPIRED");
    pendingSelections.set(ownerId, { source, ownerId, withSystemAudio: input.withSystemAudio, expiresAt: Date.now() + SELECTION_TTL_MS });
  });

  ipcMain.handle("capture:cancel-selection", (event) => {
    const ownerId = assertTrustedSender(event);
    pendingSelections.delete(ownerId);
    audioFallbackSelections.delete(ownerId);
  });

  ipcMain.handle("auth:start", async (event) => {
    assertTrustedSender(event);
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
    const flow = { state, verifier, expiresAt: Date.now() + AUTH_FLOW_TTL_MS };
    pendingAuth = flow;
    updateAuthStatus({ state: "connecting" });
    const url = new URL(AUTH_START_URL);
    url.searchParams.set("state", state);
    url.searchParams.set("challenge", challenge);
    await shell.openExternal(url.toString());
    void pollAuthFlow(flow);
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

  ipcMain.handle("rooms:list", async (event) => {
    assertTrustedSender(event);
    const response = await backendRequest("/api/rooms");
    const payload = await response.json() as { rooms?: unknown };
    return roomSummarySchema.array().max(100).parse(payload.rooms);
  });
  ipcMain.handle("rooms:get", async (event, roomId: unknown) => {
    assertTrustedSender(event);
    return getRoomSnapshot(assertRoomId(roomId));
  });
  ipcMain.handle("rooms:get-public", async (event, publicId: unknown) => {
    assertTrustedSender(event);
    if (typeof publicId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(publicId)) throw new Error("INVALID_PUBLIC_ID");
    const response = await backendRequest(`/api/rooms/public/${encodeURIComponent(publicId)}`);
    return roomSnapshotSchema.parse(await response.json());
  });
  ipcMain.handle("rooms:create", async (event, payload: unknown) => {
    assertTrustedSender(event);
    const input = roomCreateInputSchema.parse(payload);
    const response = await backendRequest("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const created = await response.json() as { invitePath?: unknown };
    const token = typeof created.invitePath === "string" ? /^\/room\/([A-Za-z0-9_-]{8,256})$/.exec(created.invitePath)?.[1] : null;
    if (!token) throw new Error("INVALID_API_RESPONSE");
    return openInvite(token);
  });
  ipcMain.handle("rooms:join-code", async (event, code: unknown) => {
    assertTrustedSender(event);
    if (typeof code !== "string" || !/^[2-9A-HJ-NP-Z]{7}$/.test(code)) throw new Error("INVALID_ROOM_CODE");
    const response = await backendRequest("/api/rooms/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const resolved = await response.json() as { joinPath?: unknown };
    const publicId = typeof resolved.joinPath === "string" ? /^\/join\/([A-Za-z0-9_-]{8,64})$/.exec(resolved.joinPath)?.[1] : null;
    if (!publicId) throw new Error("INVALID_API_RESPONSE");
    const snapshotResponse = await backendRequest(`/api/rooms/public/${encodeURIComponent(publicId)}`);
    return roomSnapshotSchema.parse(await snapshotResponse.json());
  });
  ipcMain.handle("rooms:open-invite", async (event, token: unknown) => {
    assertTrustedSender(event);
    if (typeof token !== "string") throw new Error("INVALID_INVITE");
    return openInvite(token);
  });
  ipcMain.handle("rooms:request-access", async (event, roomId: unknown) => {
    assertTrustedSender(event);
    await backendRequest(`/api/rooms/${encodeURIComponent(assertRoomId(roomId))}/request`, { method: "POST" });
  });
  ipcMain.handle("rooms:manage-member", async (event, roomId: unknown, payload: unknown) => {
    assertTrustedSender(event);
    const safeRoomId = assertRoomId(roomId);
    const input = membershipActionSchema.parse(payload);
    await backendRequest(`/api/rooms/${encodeURIComponent(safeRoomId)}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return getRoomSnapshot(safeRoomId);
  });
  ipcMain.handle("rooms:copy-invite", async (event, roomId: unknown) => {
    assertTrustedSender(event);
    const response = await backendRequest(`/api/rooms/${encodeURIComponent(assertRoomId(roomId))}/invite`, {
      method: "POST",
    });
    const payload = await response.json() as { invitePath?: unknown };
    const token = typeof payload.invitePath === "string" ? /^\/room\/([A-Za-z0-9_-]{8,256})$/.exec(payload.invitePath)?.[1] : null;
    if (!token) throw new Error("INVALID_API_RESPONSE");
    clipboard.writeText(`${API_ORIGIN}/room/${token}`);
  });
  ipcMain.handle("rooms:delete", async (event, roomId: unknown) => {
    assertTrustedSender(event);
    await backendRequest(`/api/rooms/${encodeURIComponent(assertRoomId(roomId))}`, { method: "DELETE" });
  });
  ipcMain.handle("realtime:poll", async (event, roomId: unknown, since: unknown) => {
    assertTrustedSender(event);
    if (typeof since !== "number" || !Number.isSafeInteger(since) || since < 0) throw new Error("INVALID_CURSOR");
    const response = await backendRequest(`/api/rooms/${encodeURIComponent(assertRoomId(roomId))}/signals?since=${since}`);
    return realtimePollSchema.parse(await response.json());
  });
  ipcMain.handle("realtime:send", async (event, roomId: unknown, payload: unknown) => {
    assertTrustedSender(event);
    const signal = clientSignalSchema.parse(payload);
    await backendRequest(`/api/rooms/${encodeURIComponent(assertRoomId(roomId))}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal),
    });
  });
  ipcMain.handle("realtime:ice-servers", async (event, roomId: unknown) => {
    assertTrustedSender(event);
    const response = await backendRequest(`/api/ice-servers?roomId=${encodeURIComponent(assertRoomId(roomId))}`);
    return iceServersSchema.parse(await response.json()).iceServers;
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
    if (!selection || selection.expiresAt <= Date.now()) {
      const fallback = audioFallbackSelections.get(window.webContents.id);
      audioFallbackSelections.delete(window.webContents.id);
      if (!fallback || fallback.expiresAt <= Date.now()) return callback({});
      return callback({ video: fallback.source });
    }
    if (selection.withSystemAudio) {
      audioFallbackSelections.set(window.webContents.id, {
        source: selection.source,
        ownerId: selection.ownerId,
        expiresAt: Date.now() + AUDIO_FALLBACK_TTL_MS,
      });
    } else {
      audioFallbackSelections.delete(window.webContents.id);
    }
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
  await protocol.handle("janja-app", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== "bundle" || url.username || url.password || url.port || url.search || url.hash) return new Response("Not found", { status: 404 });
      const decodedPath = decodeURIComponent(url.pathname);
      const requestedPath = resolve(rendererDirectory, decodedPath === "/" ? "index.html" : decodedPath.slice(1));
      const relativePath = relative(rendererDirectory, requestedPath);
      if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return new Response("Not found", { status: 404 });
      const contentType = rendererContentTypes[extname(requestedPath).toLowerCase()];
      if (!contentType) return new Response("Not found", { status: 404 });
      const body = await readFile(requestedPath);
      return new Response(body, { headers: { "Content-Type": contentType } });
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
      preload: resolve(currentDirectory, "../preload/index.cjs"),
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
  if (isPackagedSmokeTest) {
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
      console.error(`JANJALIVE_SMOKE_LOAD_FAILED ${errorCode} ${errorDescription}`);
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) => {
      console.error(`JANJALIVE_SMOKE_RENDERER_GONE ${details.reason}`);
    });
    mainWindow.webContents.on("console-message", ({ level, message }) => {
      if (level === "error") console.error(`JANJALIVE_SMOKE_CONSOLE_ERROR ${message}`);
    });
    mainWindow.webContents.once("did-finish-load", () => {
      void mainWindow?.webContents.executeJavaScript(`Boolean(
        window.janja &&
        document.querySelector("#root > .desktop-shell") &&
        document.body.innerText.includes("JanjaLive")
      )`).then((ready) => {
        console.log(ready ? "JANJALIVE_SMOKE_RENDERER_READY" : "JANJALIVE_SMOKE_RENDERER_NOT_READY");
      }).catch((error: unknown) => {
        console.error(`JANJALIVE_SMOKE_EVALUATION_FAILED ${error instanceof Error ? error.message : "unknown"}`);
      });
    });
  }
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  void mainWindow.loadURL(!app.isPackaged && developmentUrl ? developmentUrl : `${APP_ORIGIN}/`).catch((error: unknown) => {
    if (isPackagedSmokeTest) console.error(`JANJALIVE_SMOKE_LOAD_REJECTED ${error instanceof Error ? error.message : "unknown"}`);
  });
}

function configureUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.on("checking-for-update", () => updateStatus({ state: "checking" }));
  autoUpdater.on("update-not-available", () => updateStatus(updateRequired ? { state: "required" } : { state: "up-to-date" }));
  autoUpdater.on("download-progress", ({ percent }) => updateStatus({ state: "downloading", percent: Math.max(0, Math.min(100, percent)) }));
  autoUpdater.on("update-downloaded", ({ version }) => updateStatus({ state: "ready", version }));
  autoUpdater.on("error", () => updateStatus(updateRequired ? { state: "required" } : { state: "error" }));
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
