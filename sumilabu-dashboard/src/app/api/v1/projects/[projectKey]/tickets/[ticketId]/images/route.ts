import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isResponse, readJson, requireCaller } from "@/lib/board/http";
import { TICKET_IMAGE_LIMITS, attachTicketImage, listTicketImages } from "@/lib/board/images";
import { base64Length } from "@/lib/reports/image";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ projectKey: string; ticketId: string }> };

/** A ticket's images, without their bytes: `GET images/{imageId}` has those. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const caller = requireCaller(req, projectKey, false);
  if (isResponse(caller)) return caller;
  const images = await listTicketImages(projectKey, ticketId);
  return images ? NextResponse.json({ ok: true, images }) : NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
}

/* Twice the cap's base64 length on the wire, so an oversized image is refused
   in words (422) and a body far past it is refused before it is decoded. */
const attachSchema = z.object({ image: z.string().min(1).max(base64Length(TICKET_IMAGE_LIMITS.maxBytes) * 2) });

/**
 * Attaches one screenshot: `{ image: "<base64>" }`, plain base64 with no
 * `data:` prefix, the way a report's image is sent. A write, so it names its
 * actor. 422 in words for the bytes or a cap, 409 `done` on a done ticket.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { projectKey, ticketId } = await ctx.params;
  const parsed = attachSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_payload", details: parsed.error.issues }, { status: 400 });
  const caller = requireCaller(req, projectKey, true);
  if (isResponse(caller)) return caller;

  const outcome = await attachTicketImage(projectKey, ticketId, parsed.data.image, caller.actor ?? "");
  if (outcome.ok) return NextResponse.json({ ok: true, image: outcome.image }, { status: 201 });
  if (outcome.reason === "invalid") return NextResponse.json({ ok: false, error: outcome.problems[0], problems: outcome.problems }, { status: 422 });
  if (outcome.reason === "missing") return NextResponse.json({ ok: false, error: "missing" }, { status: 404 });
  return NextResponse.json({ ok: false, error: "done" }, { status: 409 });
}
