import { SignJWT } from "jose";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown) {} } }));
import worker from "./index";

const secret = "fake-realtime-secret-32-characters-long";
afterEach(() => vi.restoreAllMocks());
async function connect(deadline?: number, roomIdleTimeoutMs?: number) {
  const issuedAtMs = Date.now();
  const token = await new SignJWT({ roomId: "room", issuedAtMs, ...(deadline === undefined ? {} : { roomDeadline: deadline }),
    ...(roomIdleTimeoutMs === undefined ? {} : { roomIdleTimeoutMs }) })
    .setProtectedHeader({ alg: "HS256" }).setSubject("user").setIssuer("https://www.janja.live")
    .setAudience("janjalive-realtime").setJti("id").setIssuedAt(Math.floor(issuedAtMs / 1000))
    .setExpirationTime(Math.floor(issuedAtMs / 1000) + 60).sign(new TextEncoder().encode(secret));
  const forwarded = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  const request = new Request("https://worker/connect", { headers: { origin: "https://www.janja.live", upgrade: "websocket",
    "sec-websocket-protocol": `janjalive-v2, janjalive-token.${token}`, "x-janjalive-room-deadline": "1", "x-janjalive-call-idle": "true" } });
  const env = { REALTIME_TOKEN_SECRET: secret, ALLOWED_ORIGINS: "https://www.janja.live", ROOMS: { getByName: () => ({ fetch: forwarded }) } };
  const response = await worker.fetch(request, env as never);
  return { response, forwarded };
}
it("forwards only the deadline signed by the backend", async () => {
  const deadline = Date.now() + 60_000;
  const { response, forwarded } = await connect(deadline);
  expect(response.status).toBe(200);
  expect(forwarded.mock.calls[0][0].headers.get("x-janjalive-room-deadline")).toBe(String(deadline));
});
it("strips a client-supplied deadline on standard room connections", async () => {
  const { response, forwarded } = await connect();
  expect(response.status).toBe(200);
  expect(forwarded.mock.calls[0][0].headers.has("x-janjalive-room-deadline")).toBe(false);
  expect(forwarded.mock.calls[0][0].headers.has("x-janjalive-call-idle")).toBe(false);
});
it("forwards only an authenticated one-hour idle policy", async () => {
  const { response, forwarded } = await connect(undefined, 3_600_000);
  expect(response.status).toBe(200);
  expect(forwarded.mock.calls[0][0].headers.get("x-janjalive-call-idle")).toBe("true");
  const invalid = await connect(undefined, 1);
  expect(invalid.response.status).toBe(401);
  expect(invalid.forwarded).not.toHaveBeenCalled();
});
it.each([Date.now() - 1, Date.now() + 7 * 60 * 60_000])("refuses expired or excessive call deadlines", async deadline => {
  const { response, forwarded } = await connect(deadline);
  expect(response.status).toBe(401);
  expect(forwarded).not.toHaveBeenCalled();
});
