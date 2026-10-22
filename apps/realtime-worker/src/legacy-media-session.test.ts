import { describe, expect, it } from "vitest";
import { normalizeLegacyMediaSessionId } from "./legacy-media-session";

describe("legacy media session compatibility", () => {
  it("assigns the same valid session to both directions of an old peer pair", async () => {
    const request = await normalizeLegacyMediaSessionId(
      { type: "watch:request", targetUserId: "broadcaster" },
      "viewer",
    );
    const offer = await normalizeLegacyMediaSessionId(
      { type: "webrtc:offer", targetUserId: "viewer", description: { type: "offer", sdp: "sdp" } },
      "broadcaster",
    );

    expect(request).toMatchObject({ mediaSessionId: expect.stringMatching(/^legacy_[a-f0-9]{32}$/) });
    expect(offer).toMatchObject({ mediaSessionId: (request as { mediaSessionId: string }).mediaSessionId });
  });

  it("does not replace a session ID supplied by a current client", async () => {
    const current = { type: "watch:request", targetUserId: "friend", mediaSessionId: "current-session-01" };
    await expect(normalizeLegacyMediaSessionId(current, "viewer")).resolves.toBe(current);
  });

  it("does not make malformed legacy messages valid", async () => {
    const malformed = { type: "watch:request", targetUserId: "" };
    await expect(normalizeLegacyMediaSessionId(malformed, "viewer")).resolves.toBe(malformed);
  });
});
