// Only room entry paths can be resumed by the public login screen.
export function getLoginDestination(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^\/(?:join|room)\/[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}
