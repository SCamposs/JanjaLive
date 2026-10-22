import { DurableObject } from "cloudflare:workers";
import { jwtVerify } from "jose";
import {
  clientSignalingEventSchema,
  signalingEventSchema,
  type ActiveStream,
  type ClientSignal,
  type ServerSignal,
  type StreamMetadata,
} from "@janjalive/realtime-protocol";
import {
  activeRevocationCutoff,
  applyRevocationTransition,
  authorizeMediaSignal,
  consumeSignalBudget,
  hasUserSignalBudget,
  isTokenRevoked,
  removeBroadcastSessions,
  removeWatchedSession,
  resolveLegacyMediaSessionId,
  stripMediaSessionIdForLegacy,
  type SignalingConnectionState,
  type RevocationTransitionState,
  type SocketProtocol,
} from "./connection-policy";
import { normalizeLegacyMediaSessionId } from "./legacy-media-session";

type Env = {
  ROOMS: DurableObjectNamespace<RoomDurableObject>;
  RATE_LIMITS: DurableObjectNamespace<RateLimitDurableObject>;
  ALLOWED_ORIGINS: string;
  REALTIME_TOKEN_SECRET: string;
  REALTIME_INTERNAL_SECRET: string;
};

type RealtimeClaims = {
  roomId: string;
  sub: string;
  issuedAt: number;
};

type ConnectionState = SignalingConnectionState & {
  connectedAt: number;
  stream?: StreamMetadata & { startedAt: number };
};

const TOKEN_ISSUER = "https://www.janja.live";
const TOKEN_AUDIENCE = "janjalive-realtime";
const LEGACY_PROTOCOL = "janjalive-v1";
const PROTOCOL = "janjalive-v2";
const TOKEN_PROTOCOL_PREFIX = "janjalive-token.";
const MAX_MESSAGE_BYTES = 180_000;
const ROOM_CLOSED_KEY = "room:closed";

function accountRevocationKey(userId: string) {
  return `account-revoked:${userId}`;
}

function membershipRevocationKey(userId: string) {
  return `membership-revoked:${userId}`;
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

function allowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin");
  return Boolean(origin && env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).includes(origin));
}

function bearerMatches(request: Request, secret: string) {
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function tokenFromProtocols(request: Request) {
  const protocols = request.headers.get("sec-websocket-protocol")?.split(",").map((value) => value.trim()) ?? [];
  const protocol = protocols.includes(PROTOCOL) ? PROTOCOL : protocols.includes(LEGACY_PROTOCOL) ? LEGACY_PROTOCOL : null;
  const token = protocols.find((value) => value.startsWith(TOKEN_PROTOCOL_PREFIX))?.slice(TOKEN_PROTOCOL_PREFIX.length) ?? null;
  return protocol && token ? { protocol: protocol as SocketProtocol, token } : null;
}

async function verifyRealtimeToken(token: string, env: Env): Promise<RealtimeClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(env.REALTIME_TOKEN_SECRET), {
    algorithms: ["HS256"],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    maxTokenAge: "2m",
    requiredClaims: ["roomId", "sub", "jti", "iat"],
  });
  if (typeof payload.sub !== "string" || typeof payload.roomId !== "string" || !Number.isInteger(payload.iat)) throw new Error("INVALID_CLAIMS");
  return { roomId: payload.roomId, sub: payload.sub, issuedAt: payload.iat! };
}

function internalRoomRequest(request: Request, roomId: string, pathname: string) {
  const headers = new Headers(request.headers);
  headers.set("x-janjalive-room-id", roomId);
  headers.delete("authorization");
  return new Request(`https://room.internal${pathname}`, {
    method: request.method,
    headers,
    body: request.body,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true });

    if (url.pathname === "/connect") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "UPGRADE_REQUIRED" }, 426);
      if (!allowedOrigin(request, env)) return json({ error: "ORIGIN_FORBIDDEN" }, 403);
      const session = tokenFromProtocols(request);
      if (!session) return json({ error: "TOKEN_REQUIRED" }, 401);
      try {
        const claims = await verifyRealtimeToken(session.token, env);
        const headers = new Headers(request.headers);
        headers.set("x-janjalive-user-id", claims.sub);
        headers.set("x-janjalive-room-id", claims.roomId);
        headers.set("x-janjalive-token-issued-at", String(claims.issuedAt));
        headers.set("x-janjalive-protocol", session.protocol);
        const stub = env.ROOMS.getByName(claims.roomId);
        return stub.fetch(new Request("https://room.internal/connect", { headers }));
      } catch {
        return json({ error: "TOKEN_INVALID" }, 401);
      }
    }

    if (!url.pathname.startsWith("/internal/") || !bearerMatches(request, env.REALTIME_INTERNAL_SECRET)) {
      return json({ error: "NOT_FOUND" }, 404);
    }

    const roomMatch = /^\/internal\/rooms\/([0-9a-f-]{36})\/(access|event|presence)$/.exec(url.pathname);
    if (roomMatch) {
      const [, roomId, action] = roomMatch;
      const stub = env.ROOMS.getByName(roomId!);
      return stub.fetch(internalRoomRequest(request, roomId!, `/${action}`));
    }

    if (url.pathname === "/internal/rate-limit" && request.method === "POST") {
      const body = await request.json().catch(() => null) as { key?: unknown; limit?: unknown; windowSeconds?: unknown } | null;
      if (!body || typeof body.key !== "string" || body.key.length > 512 || !Number.isInteger(body.limit) || !Number.isInteger(body.windowSeconds)) {
        return json({ error: "INVALID_REQUEST" }, 400);
      }
      const limit = Number(body.limit);
      const windowSeconds = Number(body.windowSeconds);
      if (limit < 1 || limit > 10_000 || windowSeconds < 1 || windowSeconds > 86_400) return json({ error: "INVALID_REQUEST" }, 400);
      return env.RATE_LIMITS.getByName(body.key).fetch(new Request("https://rate.internal/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, windowSeconds }),
      }));
    }

    return json({ error: "NOT_FOUND" }, 404);
  },
} satisfies ExportedHandler<Env>;

export class RoomDurableObject extends DurableObject<Env> {
  private lastCursor = 0;

  private sockets() {
    return this.ctx.getWebSockets().filter((socket) => socket.readyState === WebSocket.OPEN);
  }

  private state(socket: WebSocket): ConnectionState | null {
    const value = socket.deserializeAttachment() as Partial<ConnectionState> | null;
    if (!value?.userId) return null;
    return {
      connectedAt: value.connectedAt ?? Date.now(),
      userId: value.userId,
      protocol: value.protocol === PROTOCOL ? PROTOCOL : LEGACY_PROTOCOL,
      mediaSessions: value.mediaSessions ?? [],
      signalWindowStartedAt: value.signalWindowStartedAt ?? Date.now(),
      signalCount: value.signalCount ?? 0,
      ...(value.stream ? { stream: value.stream } : {}),
    };
  }

  private states() {
    return this.sockets().map((socket) => this.state(socket)).filter((state): state is ConnectionState => Boolean(state));
  }

  private snapshot() {
    const users = new Set<string>();
    const streams = new Map<string, ActiveStream>();
    for (const socket of this.sockets()) {
      const state = this.state(socket);
      if (!state) continue;
      users.add(state.userId);
      if (state.stream && (!streams.has(state.userId) || streams.get(state.userId)!.startedAt < state.stream.startedAt)) {
        streams.set(state.userId, { streamerUserId: state.userId, ...state.stream });
      }
    }
    return { type: "snapshot" as const, onlineUserIds: [...users], activeStreams: [...streams.values()] };
  }

  private sendSnapshot() {
    const message = JSON.stringify(this.snapshot());
    for (const socket of this.sockets()) socket.send(message);
  }

  private releaseBroadcastSessions(broadcasterUserId: string) {
    for (const viewerSocket of this.sockets()) {
      const viewerState = this.state(viewerSocket);
      if (!viewerState) continue;
      removeBroadcastSessions(viewerState, broadcasterUserId);
      viewerSocket.serializeAttachment(viewerState);
    }
  }

  private emit(senderUserId: string, payload: ServerSignal) {
    const now = Date.now();
    this.lastCursor = Math.max(this.lastCursor + 1, now * 1_000);
    const id = crypto.randomUUID();
    const targetUserId = "targetUserId" in payload ? payload.targetUserId : null;
    for (const socket of this.sockets()) {
      const state = this.state(socket);
      if (!state || state.userId === senderUserId || (targetUserId && state.userId !== targetUserId)) continue;
      const recipientPayload = state.protocol === LEGACY_PROTOCOL && "mediaSessionId" in payload
        ? stripMediaSessionIdForLegacy(payload as ClientSignal)
        : payload;
      socket.send(JSON.stringify({
        type: "event",
        event: { id, senderUserId, sentAt: now, cursor: this.lastCursor, payload: recipientPayload },
      }));
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/connect") {
      const userId = request.headers.get("x-janjalive-user-id");
      const issuedAt = Number(request.headers.get("x-janjalive-token-issued-at"));
      const protocol = request.headers.get("x-janjalive-protocol") === PROTOCOL ? PROTOCOL : LEGACY_PROTOCOL;
      if (!userId || !Number.isInteger(issuedAt) || request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "INVALID_CONNECT" }, 400);
      const [accountRevocation, membershipRevocation] = await Promise.all([
        this.ctx.storage.get<RevocationTransitionState | number>(accountRevocationKey(userId)),
        this.ctx.storage.get<RevocationTransitionState | number>(membershipRevocationKey(userId)),
      ]);
      const accountRevokedAt = activeRevocationCutoff(accountRevocation);
      const membershipRevokedAt = activeRevocationCutoff(membershipRevocation);
      if (isTokenRevoked(issuedAt, Math.max(accountRevokedAt ?? -1, membershipRevokedAt ?? -1))) {
        return json({ error: "ACCESS_REVOKED" }, 403);
      }
      if (await this.ctx.storage.get<boolean>(ROOM_CLOSED_KEY)) return json({ error: "ROOM_CLOSED" }, 403);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, [`user:${userId}`]);
      const now = Date.now();
      server.serializeAttachment({
        userId,
        protocol,
        connectedAt: now,
        mediaSessions: [],
        signalWindowStartedAt: now,
        signalCount: 0,
      } satisfies ConnectionState);
      this.sendSnapshot();
      return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": protocol } });
    }

    if (url.pathname === "/presence" && request.method === "GET") {
      return json({ active: this.sockets().length > 0 });
    }

    if (url.pathname === "/access" && request.method === "POST") {
      const body = await request.json().catch(() => null) as {
        action?: unknown;
        changedAt?: unknown;
        senderUserId?: unknown;
        targetUserId?: unknown;
      } | null;
      if (
        !body
        || (body.action !== "BAN" && body.action !== "UNBAN")
        || typeof body.senderUserId !== "string" || body.senderUserId.length < 1 || body.senderUserId.length > 128
        || typeof body.targetUserId !== "string" || body.targetUserId.length < 1 || body.targetUserId.length > 128
        || !Number.isSafeInteger(body.changedAt)
        || Number(body.changedAt) <= 0
      ) return json({ error: "INVALID_ACCESS_EVENT" }, 400);
      const key = accountRevocationKey(body.targetUserId);
      const current = await this.ctx.storage.get<RevocationTransitionState>(key);
      const next = applyRevocationTransition(current, body.action === "BAN" ? "REVOKE" : "RESTORE", Number(body.changedAt));
      await this.ctx.storage.put(key, next);
      if (body.action === "BAN" && next.revoked && next.changedAt === Number(body.changedAt)) {
        this.emit(body.senderUserId, { type: "room:revoked", targetUserId: body.targetUserId });
        for (const socket of this.ctx.getWebSockets(`user:${body.targetUserId}`)) socket.close(4003, "Access revoked");
      }
      return json({ ok: true }, 202);
    }

    if (url.pathname === "/event" && request.method === "POST") {
      const body = await request.json().catch(() => null) as { changedAt?: unknown; senderUserId?: unknown; payload?: unknown } | null;
      const parsed = signalingEventSchema.safeParse(body?.payload);
      if (!body || typeof body.senderUserId !== "string" || !parsed.success) return json({ error: "INVALID_EVENT" }, 400);
      let shouldEmit = true;
      if (parsed.data.type === "room:revoked") {
        const key = membershipRevocationKey(parsed.data.targetUserId);
        const current = await this.ctx.storage.get<RevocationTransitionState>(key);
        const changedAt = Number.isSafeInteger(body.changedAt) && Number(body.changedAt) > 0 ? Number(body.changedAt) : Date.now();
        const next = applyRevocationTransition(current, "REVOKE", changedAt);
        shouldEmit = next.revoked && next.changedAt === changedAt;
        await this.ctx.storage.put(key, next);
      } else if (parsed.data.type === "room:approved") {
        const key = membershipRevocationKey(parsed.data.targetUserId);
        const current = await this.ctx.storage.get<RevocationTransitionState>(key);
        if (Number.isSafeInteger(body.changedAt) && Number(body.changedAt) > 0) {
          const changedAt = Number(body.changedAt);
          const next = applyRevocationTransition(current, "RESTORE", changedAt);
          shouldEmit = !next.revoked && next.changedAt === changedAt;
          await this.ctx.storage.put(key, next);
        } else if (!current) {
          await this.ctx.storage.put(key, applyRevocationTransition(undefined, "RESTORE", Date.now()));
        } else {
          shouldEmit = false;
        }
      } else if (parsed.data.type === "room:closed") {
        await this.ctx.storage.put(ROOM_CLOSED_KEY, true);
      }
      if (!shouldEmit) return json({ ok: true, stale: true }, 202);
      this.emit(body.senderUserId, parsed.data);
      if (parsed.data.type === "room:revoked") {
        for (const socket of this.ctx.getWebSockets(`user:${parsed.data.targetUserId}`)) socket.close(4003, "Access revoked");
      } else if (parsed.data.type === "room:closed") {
        for (const socket of this.sockets()) socket.close(4004, "Room closed");
      }
      return json({ ok: true }, 202);
    }

    return json({ error: "NOT_FOUND" }, 404);
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      socket.close(1009, "Message too large");
      return;
    }
    const state = this.state(socket);
    if (!state) return socket.close(4001, "Session missing");
    const now = Date.now();
    if (!hasUserSignalBudget(this.states(), state.userId, now) || !consumeSignalBudget(state, now)) {
      socket.close(1008, "Signal rate exceeded");
      return;
    }
    let raw: { type?: unknown; payload?: unknown };
    try {
      raw = JSON.parse(message) as { type?: unknown; payload?: unknown };
    } catch {
      socket.close(1008, "Invalid message");
      return;
    }
    const normalizedPayload = raw?.type === "signal"
      ? await normalizeLegacyMediaSessionId(raw.payload, state.userId)
      : raw.payload;
    const parsed = raw?.type === "signal" ? clientSignalingEventSchema.safeParse(normalizedPayload) : null;
    if (!parsed?.success) return socket.close(1008, "Invalid message");

    const states = this.states();
    const wasLegacy = normalizedPayload !== raw.payload;
    const payload = wasLegacy ? resolveLegacyMediaSessionId(states, state, parsed.data) : parsed.data;
    if (!authorizeMediaSignal(states, state, payload)) {
      socket.serializeAttachment(state);
      return;
    }
    if (payload.type === "stream:start") {
      state.stream = { ...payload.metadata, startedAt: Date.now() };
    } else if (payload.type === "stream:stop") {
      delete state.stream;
      this.releaseBroadcastSessions(state.userId);
    }
    this.emit(state.userId, payload);
    removeWatchedSession(state, payload);
    socket.serializeAttachment(state);
    if (payload.type === "stream:start" || payload.type === "stream:stop") this.sendSnapshot();
    if (payload.type === "presence:leave") socket.close(1000, "Left room");
  }

  webSocketClose(socket: WebSocket) {
    const state = this.state(socket);
    socket.close();
    if (state && !this.sockets().some((current) => {
      const currentState = this.state(current);
      return currentState?.userId === state.userId && Boolean(currentState.stream);
    })) this.releaseBroadcastSessions(state.userId);
    this.sendSnapshot();
  }

  webSocketError(socket: WebSocket) {
    const state = this.state(socket);
    socket.close(1011, "Socket error");
    if (state && !this.sockets().some((current) => {
      const currentState = this.state(current);
      return currentState?.userId === state.userId && Boolean(currentState.stream);
    })) this.releaseBroadcastSessions(state.userId);
    this.sendSnapshot();
  }
}

export class RateLimitDurableObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const { limit, windowSeconds } = await request.json() as { limit: number; windowSeconds: number };
    const now = Date.now();
    const current = await this.ctx.storage.get<{ count: number; resetAt: number }>("window");
    const next = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + windowSeconds * 1_000 }
      : { count: current.count + 1, resetAt: current.resetAt };
    await this.ctx.storage.put("window", next);
    return json({ allowed: next.count <= limit, remaining: Math.max(0, limit - next.count), resetAt: next.resetAt });
  }
}
