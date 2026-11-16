// Resume only explicitly supported room and Discord entry paths.
export function getLoginDestination(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^\/(?:join|room|discord|call)\/[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}
