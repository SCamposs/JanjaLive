import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "./request-security";

describe("same-origin mutation guard", () => {
  it("accepts the exact request origin", () => {
    const request = new Request("https://www.janja.live/api/admin/users/id/access", { headers: { origin: "https://www.janja.live" } });
    expect(() => assertSameOrigin(request)).not.toThrow();
  });

  it("rejects missing, foreign and lookalike origins", () => {
    expect(() => assertSameOrigin(new Request("https://www.janja.live/api/admin/users/id/access"))).toThrow("ORIGIN_FORBIDDEN");
    for (const origin of ["https://evil.example", "https://www.janja.live.evil.example", "https://janja.live"]) {
      const request = new Request("https://www.janja.live/api/admin/users/id/access", { headers: { origin } });
      expect(() => assertSameOrigin(request)).toThrow("ORIGIN_FORBIDDEN");
    }
  });
});
