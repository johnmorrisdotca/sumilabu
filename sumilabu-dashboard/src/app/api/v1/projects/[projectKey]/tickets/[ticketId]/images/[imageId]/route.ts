import { NextRequest, NextResponse } from "next/server";

import { isResponse, requireCaller } from "@/lib/board/http";
import { getTicketImage } from "@/lib/board/images";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; ticketId: string; imageId: string }> };

/**
 * One ticket image, as its bytes, for the project's board token. Nothing
 * here is public: the board's own clients (`pnpm task show`) read it, never
 * a browser. The stored type, `nosniff`, and never cached between here and
 * the caller, as a report's screenshot is served.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId, imageId } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  const image = await getTicketImage(projectKey, ticketId, imageId);
  if (!image) return NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
  return new NextResponse(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
