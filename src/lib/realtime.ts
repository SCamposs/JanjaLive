import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { signalingEventSchema, type SignalingEvent } from "./schemas";

export const SIGNAL_RETENTION_MS = 180_000;
const SIGNAL_INDEX_RETENTION_SECONDS = 360;
const MAX_INDEXED_SIGNALS = 400;

export type StoredSignal = {
  id: string;
  roomId: string;
  senderUserId: string;
  sentAt: number;
  cursor: number;
  payload: SignalingEvent;
};

let redis: Redis | undefined;

export function getRealtimeCredentials(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return {
    url: environment.UPSTASH_REDIS_REST_URL ?? environment.KV_REST_API_URL,
    token: environment.UPSTASH_REDIS_REST_TOKEN ?? environment.KV_REST_API_TOKEN,
  };
}

export function getRealtimeStore(): Redis {
  if (redis) return redis;
  const { url, token } = getRealtimeCredentials();
  if (!url || !token) throw new Error("REALTIME_NOT_CONFIGURED");
  redis = new Redis({ url, token });
  return redis;
}

function eventIndexKey(roomId: string) {
  return `janjalive:room:${roomId}:event-index`;
}

function eventSequenceKey(roomId: string) {
  return `janjalive:room:${roomId}:event-sequence`;
}

function eventPayloadKey(roomId: string, eventId: string) {
  return `janjalive:room:${roomId}:event:${eventId}`;
}

function presenceKey(roomId: string) {
  return `janjalive:room:${roomId}:presence`;
}

function streamsKey(roomId: string) {
  return `janjalive:room:${roomId}:streams`;
}

export async function publishSignal(roomId: string, senderUserId: string, payload: SignalingEvent) {
  const store = getRealtimeStore();
  const now = Date.now();
  const sequence = await store.incr(eventSequenceKey(roomId));
  const signal: StoredSignal = {
    id: nanoid(),
    roomId,
    senderUserId,
    sentAt: now,
    cursor: getSignalCursor(now, sequence),
    payload,
  };

  await Promise.all([
    store.set(eventPayloadKey(roomId, signal.id), signal, { px: SIGNAL_RETENTION_MS }),
    store.hset(presenceKey(roomId), { [senderUserId]: now }),
  ]);
  await store.zadd(eventIndexKey(roomId), { score: signal.cursor, member: signal.id });
  const indexedSignals = await store.zcard(eventIndexKey(roomId));
  await Promise.all([
    store.zremrangebyscore(eventIndexKey(roomId), "-inf", getSignalCutoff(now)),
    indexedSignals > MAX_INDEXED_SIGNALS
      ? store.zremrangebyrank(eventIndexKey(roomId), 0, indexedSignals - MAX_INDEXED_SIGNALS - 1)
      : Promise.resolve(0),
    store.expire(eventIndexKey(roomId), SIGNAL_INDEX_RETENTION_SECONDS),
    store.expire(eventSequenceKey(roomId), SIGNAL_INDEX_RETENTION_SECONDS),
    store.expire(presenceKey(roomId), 180),
  ]);

  if (payload.type === "stream:start") {
    await store.hset(streamsKey(roomId), {
      [senderUserId]: JSON.stringify({ ...payload.metadata, startedAt: now }),
    });
    await store.expire(streamsKey(roomId), 180);
  } else if (payload.type === "stream:stop" || payload.type === "presence:leave") {
    await store.hdel(streamsKey(roomId), senderUserId);
    if (payload.type === "presence:leave") await store.hdel(presenceKey(roomId), senderUserId);
  }

  return signal;
}

function parseStoredSignal(value: unknown): StoredSignal | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<StoredSignal>;
    const payload = signalingEventSchema.safeParse(candidate.payload);
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.roomId !== "string" ||
      typeof candidate.senderUserId !== "string" ||
      typeof candidate.sentAt !== "number" ||
      !Number.isFinite(candidate.sentAt) ||
      typeof candidate.cursor !== "number" ||
      !Number.isSafeInteger(candidate.cursor) ||
      !payload.success
    ) return null;
    return { ...candidate, payload: payload.data } as StoredSignal;
  } catch {
    return null;
  }
}

export function getSignalCursor(now: number, sequence: number) {
  return now * 1_000 + (sequence % 1_000);
}

export function getSignalCutoff(now: number) {
  return (now - SIGNAL_RETENTION_MS) * 1_000;
}

export async function readRoomRealtime(roomId: string, userId: string, since: number) {
  const store = getRealtimeStore();
  const now = Date.now();
  await store.hset(presenceKey(roomId), { [userId]: now });
  await Promise.all([store.expire(presenceKey(roomId), 180), store.expire(streamsKey(roomId), 180)]);

  await store.zremrangebyscore(eventIndexKey(roomId), "-inf", getSignalCutoff(now));
  const eventIds = await store.zrange<string[]>(
    eventIndexKey(roomId),
    `(${since}` as `(${number}`,
    "+inf",
    { byScore: true },
  );

  const [rawEvents, presence, streams] = await Promise.all([
    eventIds.length
      ? store.mget<unknown[]>(...eventIds.map((eventId) => eventPayloadKey(roomId, eventId)))
      : Promise.resolve([]),
    store.hgetall<Record<string, number>>(presenceKey(roomId)),
    store.hgetall<Record<string, string>>(streamsKey(roomId)),
  ]);

  const parsedEvents = rawEvents
    .map(parseStoredSignal)
    .filter((event): event is StoredSignal => Boolean(event))
    .filter((event) => event.roomId === roomId && event.sentAt > now - SIGNAL_RETENTION_MS);
  const cursor = parsedEvents.reduce((latest, event) => Math.max(latest, event.cursor), since);
  const events = parsedEvents
    .filter((event) => {
      const target = "targetUserId" in event.payload ? event.payload.targetUserId : null;
      return event.senderUserId !== userId && (!target || target === userId);
    })
    .sort((left, right) => left.cursor - right.cursor);

  const onlineUserIds = Object.entries(presence ?? {})
    .filter(([, lastSeen]) => now - Number(lastSeen) < 45_000)
    .map(([presenceUserId]) => presenceUserId);

  const activeStreams = Object.entries(streams ?? {}).flatMap(([streamerUserId, value]) => {
    if (!onlineUserIds.includes(streamerUserId)) return [];
    try {
      return [{ streamerUserId, ...(typeof value === "string" ? JSON.parse(value) : value) }];
    } catch {
      return [];
    }
  });

  return { events, onlineUserIds, activeStreams, cursor };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  const store = getRealtimeStore();
  const count = await store.incr(`janjalive:rate:${key}`);
  if (count === 1) await store.expire(`janjalive:rate:${key}`, windowSeconds);
  if (count > limit) throw new Error("RATE_LIMITED");
}
