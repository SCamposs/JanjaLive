import { z } from "zod";

const AUTH_CODE = /^[A-Za-z0-9_-]{32,256}$/;
const AUTH_STATE = /^[A-Za-z0-9_-]{32,128}$/;
const ROOM_TOKEN = /^[A-Za-z0-9_-]{8,256}$/;

export type DesktopDeepLink =
  | { type: "auth"; code: string; state: string }
  | { type: "room"; roomToken: string };

export function parseDeepLink(value: string): DesktopDeepLink | null {
  if (value.length > 1_024) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "janjalive:" || url.username || url.password || url.port || url.hash) return null;

  if (url.hostname === "auth" && url.pathname === "/callback") {
    if ([...url.searchParams.keys()].some((key) => key !== "code" && key !== "state")) return null;
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    return AUTH_CODE.test(code) && AUTH_STATE.test(state) ? { type: "auth", code, state } : null;
  }

  if (url.hostname === "room" && !url.search && url.pathname.split("/").filter(Boolean).length === 1) {
    const roomToken = url.pathname.slice(1);
    return ROOM_TOKEN.test(roomToken) ? { type: "room", roomToken } : null;
  }

  return null;
}

const fixedExternalUrls = z.enum([
  "https://janja.live/privacidade",
  "https://janja.live/termos",
  "https://github.com/SCamposs/JanjaLive",
]);

export function parseExternalUrl(value: unknown): string | null {
  const result = fixedExternalUrls.safeParse(value);
  return result.success ? result.data : null;
}

export function findDeepLink(argv: readonly string[]): DesktopDeepLink | null {
  const candidate = argv.find((argument) => argument.startsWith("janjalive://"));
  return candidate ? parseDeepLink(candidate) : null;
}
