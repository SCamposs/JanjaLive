import { EventEmitter } from "node:events";
import type { DesktopCapturerSource, WebContents } from "electron";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), ports: [] as EventEmitter[] }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>(), existsSync: () => true }));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class Port extends EventEmitter {
    postMessage() {}
    close() { this.emit("close"); }
  }
  return { app: { isPackaged: false, getAppPath: () => "/test" }, MessageChannelMain: class {
    port1 = new Port(); port2 = new Port();
    constructor() { mocks.ports.push(this.port1); }
  } };
});
import { NativeAudioManager } from "./native-audio";

function fixture() {
  const originalProcess = process;
  vi.stubGlobal("process", new Proxy(originalProcess, { get(target, key) { return key === "platform" ? "win32" : Reflect.get(target, key); } }));
  class Child extends EventEmitter {
    killed = false;
    exitCode: number | null = null;
    stdout = new EventEmitter(); stderr = new EventEmitter();
    stdin = { end: vi.fn(() => queueMicrotask(() => this.emit("close", 0))) };
    kill = vi.fn(() => { this.killed = true; this.emit("close", 0); });
  }
  const children: Child[] = [];
  mocks.spawn.mockImplementation(() => {
    const child = new Child();
    children.push(child);
    const format = Buffer.alloc(20);
    format.write("JNJA"); format.writeUInt16LE(1, 4); format.writeUInt16LE(1, 6); format.writeUInt32LE(8, 8);
    format.writeUInt32LE(48_000, 12); format.writeUInt16LE(2, 16); format.writeUInt16LE(16, 18);
    queueMicrotask(() => child.stdout.emit("data", format));
    return child;
  });
  const manager = new NativeAudioManager();
  const start = (owner: number) => manager.start(owner, { id: "screen:1:0" } as DesktopCapturerSource, "system", { postMessage: vi.fn() } as unknown as WebContents);
  return { manager, children, start };
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); mocks.ports = []; });
it("terminates the native producer when its renderer audio port disappears", async () => {
  const f = fixture();
  expect((await f.start(1)).status).toBe("started");
  mocks.ports[0]!.emit("close");
  expect(f.children[0]!.kill).toHaveBeenCalledOnce();
  await f.manager.stopAll();
});
it("releases only the departing renderer's sessions", async () => {
  const f = fixture();
  await f.start(1); await f.start(2);
  await f.manager.stopOwner(1);
  expect(f.children[0]!.kill).toHaveBeenCalled();
  expect(f.children[1]!.kill).not.toHaveBeenCalled();
  await f.manager.stopAll();
});
