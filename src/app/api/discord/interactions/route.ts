import { after } from "next/server";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import { discordConfig, discordEnabled, discordMessage } from "@/lib/discord/config";
import { discordRequest, verifyDiscordSignature } from "@/lib/discord/api";
import { createCallIntent } from "@/lib/discord/calls";
import { canCleanDiscordMessages, canReadDiscordHistory, cleanDiscordMessages, cleanupMessage } from "@/lib/discord/cleanup";

export const runtime = "nodejs";
export const maxDuration = 60;
const snowflake = z.string().regex(/^\d{17,20}$/);
const commandSchema = z.object({ type: z.literal(2), id: snowflake, application_id: snowflake, guild_id: snowflake,
  token: z.string().regex(/^[\w.-]{1,512}$/), channel_id: snowflake.optional(), app_permissions: z.string().optional(),
  member: z.object({ user: z.object({ id: snowflake }), permissions: z.string().optional() }),
  data: z.object({ name: z.enum(["janja", "janja-limpar"]) }) });

export async function POST(request: Request) {
  if (!discordEnabled()) return new Response(null, { status: 404 });
  let config;
  try { config = discordConfig(); } catch { return new Response(null, { status: 503 }); }
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 65_536) { await reader.cancel(); return new Response(null, { status: 413 }); }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks);
  if (!verifyDiscordSignature(raw, request.headers.get("x-signature-timestamp"), request.headers.get("x-signature-ed25519"))) {
    return new Response(null, { status: 401 });
  }
  let payload;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return new Response(null, { status: 400 }); }
  if (payload?.type === 1) return Response.json({ type: 1 });
  const parsed = commandSchema.safeParse(payload);
  if (!parsed.success || parsed.data.application_id !== config.appId || parsed.data.guild_id !== config.guildId) {
    return Response.json({ type: 4, data: { flags: 64, content: "Esta integração não está disponível neste servidor." } });
  }
  const interaction = parsed.data;
  if (interaction.data.name === "janja-limpar") {
    const error = !interaction.channel_id || !canCleanDiscordMessages(interaction.member.permissions ?? "")
      ? "Você precisa da permissão Gerenciar mensagens neste canal para usar /janja-limpar."
      : !canReadDiscordHistory(interaction.app_permissions ?? "")
        ? "Permita que o JanjaLive leia o histórico de mensagens deste canal para executar a limpeza." : null;
    if (error) return Response.json({ type: 4, data: { flags: 64, content: error } });
  }
  after(async () => {
    let content: string;
    let components: unknown[] = [];
    try {
      if (interaction.data.name === "janja-limpar") {
        content = cleanupMessage(await cleanDiscordMessages(interaction.guild_id, interaction.channel_id!, interaction.member.user.id));
      } else {
        const intent = await createCallIntent(interaction.id, interaction.member.user.id);
        content = "Continue no JanjaLive para abrir a sala da call.";
        components = [{ type: 1, components: [{ type: 2, style: 5, label: "Continuar no JanjaLive", url: `${config.origin}/discord/${intent.id}` }] }];
      }
    } catch (error) { content = discordMessage(error); }
    try {
      await discordRequest(`/webhooks/${config.appId}/${interaction.token}/messages/@original`, {
        method: "PATCH", webhook: true, body: { content, components, allowed_mentions: { parse: [] } },
      });
      if (interaction.data.name === "janja-limpar") {
        await delay(6000);
        await discordRequest(`/webhooks/${config.appId}/${interaction.token}/messages/@original`, {
          method: "DELETE", webhook: true,
        });
      }
    } catch { console.warn("Discord interaction response could not be delivered."); }
  });
  return Response.json({ type: 5, data: interaction.data.name === "janja-limpar" ? {} : { flags: 64 } });
}
