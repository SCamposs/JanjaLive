import { describe, expect, it, vi } from "vitest";
import type { AuthStatus, JanjaDesktopApi } from "../../shared/contracts";
import { subscribeAuthStatus } from "./auth-session";

function fixture() {
  let resolve!: (value: AuthStatus) => void;
  let reject!: (error: Error) => void;
  let emit!: (value: AuthStatus) => void;
  const remove = vi.fn();
  const api: JanjaDesktopApi["auth"] = {
    getStatus: () => new Promise<AuthStatus>((done, fail) => { resolve = done; reject = fail; }),
    onStatus: (listener) => { emit = listener; return remove; },
    start: vi.fn(), cancel: vi.fn(), logout: vi.fn(),
  };
  return { api, resolve: (value: AuthStatus) => resolve(value), reject: () => reject(new Error("IPC_FAILED")), emit: (value: AuthStatus) => emit(value), remove };
}

describe("desktop initial authentication", () => {
  it("uses the initial status when no newer event has arrived", async () => {
    const data = fixture(); const listener = vi.fn();
    subscribeAuthStatus(data.api, listener);
    data.resolve({ state: "signed-out" });
    await Promise.resolve();
    expect(listener).toHaveBeenCalledWith({ state: "signed-out" });
  });
  it("does not replace a newer status with a delayed initial snapshot", async () => {
    const data = fixture(); const listener = vi.fn();
    subscribeAuthStatus(data.api, listener);
    data.emit({ state: "signed-out" });
    data.resolve({ state: "checking" });
    await Promise.resolve();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenLastCalledWith({ state: "signed-out" });
  });
  it("reports IPC failures and ignores callbacks after cleanup", async () => {
    const data = fixture(); const listener = vi.fn();
    const stop = subscribeAuthStatus(data.api, listener);
    data.reject();
    await Promise.resolve(); await Promise.resolve();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ state: "error" }));
    stop(); data.emit({ state: "checking" });
    expect(data.remove).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
  });
});
