import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DISCORD_CALL_IDLE_TIMEOUT_MS as HOUR } from "@janjalive/realtime-protocol";
import { CallIdleSession } from "./call-idle";

function fixture() {
  const data = new Map<string, unknown>();
  let people = 0;
  const storage = { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); },
    setAlarm: vi.fn<(...time: [number]) => Promise<void>>(async () => {}), deleteAlarm: vi.fn(async () => {}) };
  const ctx = { storage } as unknown as DurableObjectState;
  const make = () => new CallIdleSession(ctx, () => people > 0);
  return { data, storage, make, idle: make(), setPeople: (value: number) => { people = value; } };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

it("expires a never-opened room at one hour and never resurrects it", async () => {
  const f = fixture(); const end = Date.now() + HOUR;
  expect(await f.idle.configure(end)).toEqual({ active: false, closed: false, idleExpiresAt: end });
  vi.advanceTimersByTime(HOUR);
  expect(await f.idle.alarm()).toBe("expired");
  expect((await f.idle.configure(Date.now() + HOUR)).closed).toBe(true);
  f.setPeople(1); await f.idle.connected();
  expect(f.data.get("room:closed")).toBe(true);
});
it("keeps occupied rooms alive beyond six hours and starts a full hour when the last participant leaves", async () => {
  const f = fixture(); await f.idle.configure(Date.now() + HOUR);
  f.setPeople(2); await f.idle.connected();
  vi.advanceTimersByTime(8 * HOUR);
  expect(await f.idle.alarm()).toBe("active");
  f.setPeople(1); await f.idle.disconnected();
  expect((await f.idle.configure(1)).idleExpiresAt).toBeNull();
  f.setPeople(0); await f.idle.disconnected();
  const end = Date.now() + HOUR;
  expect((await f.idle.configure(1)).idleExpiresAt).toBe(end);
  vi.advanceTimersByTime(HOUR - 1);
  expect(await f.idle.alarm()).toBe("waiting");
  vi.advanceTimersByTime(1); expect(await f.idle.alarm()).toBe("expired");
});
it("does not extend idle time through reads, duplicate close events, retries or reconstruction", async () => {
  const f = fixture(); const end = Date.now() + HOUR;
  await f.idle.configure(end); vi.advanceTimersByTime(20 * 60_000);
  await f.idle.disconnected();
  expect((await f.make().configure(Date.now() + HOUR)).idleExpiresAt).toBe(end);
  vi.advanceTimersByTime(40 * 60_000);
  expect(await f.make().alarm()).toBe("expired");
});
it("cancels the idle clock on return and starts a fresh hour at the next last departure", async () => {
  const f = fixture(); await f.idle.configure(Date.now() + HOUR);
  vi.advanceTimersByTime(HOUR - 1); f.setPeople(1); await f.idle.connected();
  expect(f.storage.deleteAlarm).toHaveBeenCalled();
  vi.advanceTimersByTime(2 * HOUR);
  expect((await f.make().configure(1)).active).toBe(true);
  f.setPeople(0); await f.make().disconnected();
  expect((await f.make().configure(1)).idleExpiresAt).toBe(Date.now() + HOUR);
});
it("migrates an occupied legacy room without its fixed deadline and clamps an empty legacy room to one hour", async () => {
  const occupied = fixture(); occupied.setPeople(1);
  expect((await occupied.idle.configure(Date.now() + 6 * HOUR)).idleExpiresAt).toBeNull();
  const empty = fixture();
  expect((await empty.idle.configure(Date.now() + 6 * HOUR)).idleExpiresAt).toBe(Date.now() + HOUR);
});
it("recovers the idle clock after an occupied state is restored without any remaining sockets", async () => {
  const f = fixture(); f.setPeople(1); await f.idle.configure(Date.now() + HOUR);
  f.setPeople(0);
  expect(await f.make().alarm()).toBe("waiting");
  expect((await f.make().configure(1)).idleExpiresAt).toBe(Date.now() + HOUR);
});
it("does not configure ordinary rooms and respects a manual close", async () => {
  const f = fixture(); expect(await f.idle.alarm()).toBe("unconfigured");
  expect(f.storage.setAlarm).not.toHaveBeenCalled();
  f.data.set("room:closed", true);
  expect(await f.idle.configure(Date.now() + HOUR)).toEqual({ active: false, closed: true, idleExpiresAt: null });
  expect(f.data.has("room:idle")).toBe(false);
});
