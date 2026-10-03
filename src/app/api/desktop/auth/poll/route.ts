import { z } from "zod";
import { apiError } from "@/lib/api";
import { exchangeDesktopAuthGrant } from "@/lib/desktop-auth";

const pollSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
}).strict();

export async function POST(request: Request) {
  try {
    const result = await exchangeDesktopAuthGrant(pollSchema.parse(await request.json()));
    if (!result) {
      return Response.json({ pending: true }, {
        status: 202,
        headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
      });
    }
    return Response.json(result, {
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch (error) {
    return apiError(error);
  }
}
