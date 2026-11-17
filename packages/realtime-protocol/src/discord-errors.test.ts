import { expect, it } from "vitest";
import { discordCallErrorMessage, isDiscordCallError } from "./discord-errors";
it("shares clean call errors across web and Electron IPC without exposing unknown server text", () => {
  expect(discordCallErrorMessage(new Error("Error invoking remote method 'rooms:open-invite': Error: DISCORD_CALL_REQUIRED"))).toContain("Entre na call");
  expect(discordCallErrorMessage(new Error("private backend details"))).toBeNull();
  expect(isDiscordCallError("DISCORD_PERMISSION")).toBe(true);
  expect(discordCallErrorMessage(new Error("Error invoking remote method 'rooms:open-invite': Error: DISCORD_GUILD_BLOCKED"))).toContain("bloqueada neste servidor");
});
