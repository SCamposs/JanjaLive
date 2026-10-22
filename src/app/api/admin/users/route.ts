import { z } from "zod";
import { apiError } from "@/lib/api";
import { listAdminUsers } from "@/lib/account-access";
import { requireAdmin } from "@/lib/admin";

const querySchema = z.object({
  q: z.string().max(128).catch(""),
  order: z.enum(["newest", "oldest"]).catch("newest"),
  page: z.coerce.number().int().min(1).catch(1),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const query = querySchema.parse({
      q: params.get("q") ?? "",
      order: params.get("order") ?? "newest",
      page: params.get("page") ?? "1",
    });
    return Response.json(await listAdminUsers({ search: query.q, order: query.order, page: query.page }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return new Response(null, { status: 404 });
    return apiError(error);
  }
}
