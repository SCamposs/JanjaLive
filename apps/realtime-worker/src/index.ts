import { DurableObject } from "cloudflare:workers";
import { jwtVerify } from "jose";
import {
  clientSignalingEventSchema,
  signalingEventSchema,
  type ActiveStream,
  type ServerSignal,
  type StreamMetadata,
} from "@janjalive/realtime-protocol";

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
};

type ConnectionState = {
  userId: string;
  connectedAt: number;
  stream?: StreamMetadata & { startedAt: number };
};

const TOKEN_ISSUER = "https://www.janja.live";
const TOKEN_AUDIENCE = "janjalive-realtime";
const PROTOCOL = "janjalive-v1";
const TOKEN_PROTOCOL_PREFIX = "janjalive-token.";
const MAX_MESSAGE_BYTES = 180_000;

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
  if (!protocols.includes(PROTOCOL)) return null;
  return protocols.find((value) => value.startsWith(TOKEN_PROTOCOL_PREFIX))?.slice(TOKEN_PROTOCOL_PREFIX.length) ?? null;
}

async function verifyRealtimeToken(token: string, env: Env): Promise<RealtimeClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(env.REALTIME_TOKEN_SECRET), {
    algorithms: ["HS256"],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    maxTokenAge: "2m",
    requiredClaims: ["roomId", "sub", "jti"],
  });
  if (typeof payload.sub !== "string" || typeof payload.roomId !== "string") throw new Error("INVALID_CLAIMS");
  return { roomId: payload.roomId, sub: payload.sub };
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
      const token = tokenFromProtocols(request);
      if (!token) return json({ error: "TOKEN_REQUIRED" }, 401);
      try {
        const claims = await verifyRealtimeToken(token, env);
        const headers = new Headers(request.headers);
        headers.set("x-janjalive-user-id", claims.sub);
        headers.set("x-janjalive-room-id", claims.roomId);
        const stub = env.ROOMS.getByName(claims.roomId);
        return stub.fetch(new Request("https://room.internal/connect", { headers }));
      } catch {
        return json({ error: "TOKEN_INVALID" }, 401);
      }
    }

    if (!url.pathname.startsWith("/internal/") || !bearerMatches(request, env.REALTIME_INTERNAL_SECRET)) {
      return json({ error: "NOT_FOUND" }, 404);
    }

    const roomMatch = /^\/internal\/rooms\/([0-9a-f-]{36})\/(event|presence)$/.exec(url.pathname);
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

  private state(socket: WebSocket) {
    return socket.deserializeAttachment() as ConnectionState | null;
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

  private emit(senderUserId: string, payload: ServerSignal) {
    const now = Date.now();
    this.lastCursor = Math.max(this.lastCursor + 1, now * 1_000);
    const message = JSON.stringify({
      type: "event",
      event: { id: crypto.randomUUID(), senderUserId, sentAt: now, cursor: this.lastCursor, payload },
    });
    const targetUserId = "targetUserId" in payload ? payload.targetUserId : null;
    for (const socket of this.sockets()) {
      const state = this.state(socket);
      if (!state || state.userId === senderUserId || (targetUserId && state.userId !== targetUserId)) continue;
      socket.send(message);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/connect") {
      const userId = request.headers.get("x-janjalive-user-id");
      if (!userId || request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "INVALID_CONNECT" }, 400);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, [`user:${userId}`]);
      server.serializeAttachment({ userId, connectedAt: Date.now() } satisfies ConnectionState);
      this.sendSnapshot();
      return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": PROTOCOL } });
    }

    if (url.pathname === "/presence" && request.method === "GET") {
      return json({ active: this.sockets().length > 0 });
    }

    if (url.pathname === "/event" && request.method === "POST") {
      const body = await request.json().catch(() => null) as { senderUserId?: unknown; payload?: unknown } | null;
      const parsed = signalingEventSchema.safeParse(body?.payload);
      if (!body || typeof body.senderUserId !== "string" || !parsed.success) return json({ error: "INVALID_EVENT" }, 400);
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
    let raw: { type?: unknown; payload?: unknown };
    try {
      raw = JSON.parse(message) as { type?: unknown; payload?: unknown };
    } catch {
      socket.close(1008, "Invalid message");
      return;
    }
    const parsed = raw?.type === "signal" ? clientSignalingEventSchema.safeParse(raw.payload) : null;
    if (!parsed?.success) return socket.close(1008, "Invalid message");

    const payload = parsed.data;
    if (payload.type === "stream:start") {
      state.stream = { ...payload.metadata, startedAt: Date.now() };
      socket.serializeAttachment(state);
    } else if (payload.type === "stream:stop") {
      delete state.stream;
      socket.serializeAttachment(state);
    }
    this.emit(state.userId, payload);
    if (payload.type === "stream:start" || payload.type === "stream:stop") this.sendSnapshot();
    if (payload.type === "presence:leave") socket.close(1000, "Left room");
  }

  webSocketClose(socket: WebSocket) {
    socket.close();
    this.sendSnapshot();
  }

  webSocketError(socket: WebSocket) {
    socket.close(1011, "Socket error");
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
