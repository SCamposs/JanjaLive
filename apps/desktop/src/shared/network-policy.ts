export const API_ORIGIN = "https://www.janja.live";

export const DESKTOP_AUTH_URLS = {
  start: `${API_ORIGIN}/desktop/auth/start`,
  exchange: `${API_ORIGIN}/api/desktop/auth/exchange`,
  session: `${API_ORIGIN}/api/desktop/auth/session`,
} as const;

export function isAllowedRemoteRequest(url: string) {
  return url.startsWith(`${API_ORIGIN}/`) || url.startsWith("https://cdn.discordapp.com/");
}
