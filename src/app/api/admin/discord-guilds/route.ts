import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { listDiscordGuilds } from "@/lib/discord/guilds";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const page = z.coerce.number().int().min(1).catch(1).parse(params.get("page") ?? 1);
    const search = z.string().max(100).catch("").parse(params.get("q") ?? "");
    return Response.json(await listDiscordGuilds(search, page), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return new Response(null, { status: 404 });
    return apiError(error);
  }
}
