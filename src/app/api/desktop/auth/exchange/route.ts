import { z } from "zod";
import { apiError } from "@/lib/api";
import { exchangeDesktopAuthGrant } from "@/lib/desktop-auth";

const exchangeSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  state: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
}).strict();

export async function POST(request: Request) {
  try {
    const result = await exchangeDesktopAuthGrant(exchangeSchema.parse(await request.json()));
    return Response.json(result, {
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (error) {
    return apiError(error);
  }
}
