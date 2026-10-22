import { z } from "zod";
import { apiError } from "@/lib/api";
import { listAdminUsers } from "@/lib/account-access";
import { requireAdmin } from "@/lib/admin";

const querySchema = z.string().max(128).catch("");

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const search = querySchema.parse(new URL(request.url).searchParams.get("q") ?? "");
    return Response.json({ users: await listAdminUsers(search) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return new Response(null, { status: 404 });
    return apiError(error);
  }
}
