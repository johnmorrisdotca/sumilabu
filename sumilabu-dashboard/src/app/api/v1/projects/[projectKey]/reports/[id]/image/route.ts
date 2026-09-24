import { NextRequest, NextResponse } from "next/server";

import { TOKEN_SCOPES, authorizeBoard } from "@/lib/board/auth";
import { getReportImage } from "@/lib/reports/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; id: string }> };

/**
 * A report's screenshot, as its bytes. The owning project's reports token or
 * its board token - the two a site's own server holds for its admin pages,
 * which proxy this to a signed-in admin; nothing here is public, and a
 * browser never calls it directly. A report with no screenshot, or one in
 * another project, is 404.
 *
 * The response is the stored type (read from the bytes when the image
 * arrived), `nosniff`, and never cached by anything between the site and here.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey, id } = await ctx.params;
  const caller = authorizeBoard(req, projectKey, TOKEN_SCOPES.reports) ?? authorizeBoard(req, projectKey, TOKEN_SCOPES.board);
  if (!caller) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const image = await getReportImage(projectKey, id);
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
