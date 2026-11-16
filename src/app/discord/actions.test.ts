import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("@/lib/api", () => ({ requireUser: async () => ({ id: "user" }) }));
vi.mock("@/lib/discord/calls", () => ({ startCall: mocks.start, desktopCallLink: () => "janjalive://fixture" }));
import { startCallAction } from "./actions";
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());
it("marks a closed or expired preparation as terminal", async () => {
  mocks.start.mockRejectedValue(new Error("DISCORD_EXPIRED"));
  expect(await startCallAction("intent", {}, new FormData())).toHaveProperty("expired", true);
});
it("keeps temporary failures retryable", async () => {
  mocks.start.mockRejectedValue(new Error("DISCORD_UNAVAILABLE"));
  const state = await startCallAction("intent", {}, new FormData());
  expect(state.expired).toBeUndefined(); expect(state.error).toBeTruthy();
});
