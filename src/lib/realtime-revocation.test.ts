import { afterEach, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ events: [] as string[], sequence: 0 }));
vi.mock("@upstash/redis", () => ({ Redis: class {
  async incr() { return ++store.sequence; }
  async eval() { return [store.events, { owner: Date.now(), viewer: Date.now() }, {}, 0]; }
  pipeline() {
    const pipeline = { hset: () => pipeline, hdel: () => pipeline, expire: () => pipeline,
      zadd: (_: string, value: { member: string }) => { store.events.push(value.member); return pipeline; },
      zremrangebyscore: () => pipeline, zcard: () => pipeline, exec: async () => [0, 0, 0, 1] };
    return pipeline;
  }
} }));
import { publishSignal, readRoomRealtime } from "./realtime";
afterEach(() => { vi.unstubAllEnvs(); store.events = []; store.sequence = 0; });
it("delivers a server-only media cutoff to the owner and other emitters in the HTTP provider", async () => {
  vi.stubEnv("REALTIME_PROVIDER", "upstash");
  vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io");
  vi.stubEnv("KV_REST_API_TOKEN", "test-token");
  const cutoff = Date.now();
  await publishSignal("room", "owner", { type: "room:revoked", targetUserId: "viewer" }, { changedAt: cutoff });
  const owner = await readRoomRealtime("room", "owner", 0);
  expect(owner.realtime.events.map((e) => e.payload)).toEqual([{ type: "room:peer-revoked", targetUserId: "viewer", changedAt: cutoff }]);
  const other = await readRoomRealtime("room", "other", 0);
  expect(other.realtime.events.map((e) => e.payload)).toEqual([{ type: "room:peer-revoked", targetUserId: "viewer", changedAt: cutoff }]);
  const viewer = await readRoomRealtime("room", "viewer", 0);
  expect(viewer.realtime.events.map((e) => e.payload.type)).toContain("room:revoked");
});
