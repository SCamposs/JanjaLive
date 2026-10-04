import { describe, expect, it, vi } from "vitest";
import { launchBrowserAuth } from "./auth-launch";

describe("desktop browser authentication", () => {
  it("starts polling without waiting for the browser launcher to settle", () => {
    const startPolling = vi.fn();
    const openBrowser = vi.fn(() => new Promise(() => undefined));

    launchBrowserAuth(startPolling, openBrowser, vi.fn());

    expect(startPolling).toHaveBeenCalledOnce();
    expect(openBrowser).toHaveBeenCalledOnce();
  });

  it("reports a browser launch failure", async () => {
    const onOpenError = vi.fn();

    launchBrowserAuth(vi.fn(), () => Promise.reject(new Error("failed")), onOpenError);
    await Promise.resolve();

    expect(onOpenError).toHaveBeenCalledOnce();
  });
});
