export const API_ORIGIN = "https://www.janja.live";
export const REALTIME_ORIGIN = "https://janjalive-realtime.soarescmpos.workers.dev";
export const REALTIME_WEBSOCKET_ORIGIN = "wss://janjalive-realtime.soarescmpos.workers.dev";

export const DESKTOP_AUTH_URLS = {
  start: `${API_ORIGIN}/desktop/auth/start`,
  exchange: `${API_ORIGIN}/api/desktop/auth/exchange`,
  session: `${API_ORIGIN}/api/desktop/auth/session`,
} as const;

export function isAllowedRemoteRequest(url: string) {
  return url.startsWith(`${API_ORIGIN}/`) ||
    url.startsWith(`${REALTIME_ORIGIN}/`) ||
    url.startsWith(`${REALTIME_WEBSOCKET_ORIGIN}/`) ||
    url.startsWith("https://cdn.discordapp.com/");
}
