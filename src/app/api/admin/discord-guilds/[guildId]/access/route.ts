import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { setDiscordGuildAccess } from "@/lib/discord/guilds";
import { enforceRateLimit } from "@/lib/realtime";
import { assertSameOrigin } from "@/lib/request-security";

export async function POST(request: Request, context: { params: Promise<{ guildId: string }> }) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    await enforceRateLimit(`admin:${admin.id}:discord-guilds`, 20, 60);
    const guildId = z.string().regex(/^\d{17,20}$/).parse((await context.params).guildId);
    const body = z.object({ blocked: z.boolean() }).strict().parse(await request.json());
    return Response.json(await setDiscordGuildAccess(admin.id, guildId, body.blocked), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return new Response(null, { status: 404 });
    return apiError(error);
  }
}
