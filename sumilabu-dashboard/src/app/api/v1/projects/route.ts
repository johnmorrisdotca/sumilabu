import { NextRequest, NextResponse } from "next/server";

import { authorizeAnyBoard, boardProjectKeys } from "@/lib/board/auth";

export const runtime = "nodejs";

/**
 * The project keys a board token exists for - names, never tokens. A client
 * that already holds one project's board token (UmaKuma, say) asks this to
 * learn that `itsutsu` is a real project key before it is separately handed
 * a token for it; the list grants no write access anywhere by itself; every
 * write still needs that other project's own token; presenting a token this
 * service does not recognize is a plain 401. There is deliberately no way to
 * write to a project with a different project's token - see BOARD_RULES.md,
 * "Tokens and projects".
 */
export async function GET(req: NextRequest) {
  const caller = authorizeAnyBoard(req);
  if (!caller) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, api_version: "v1", projects: boardProjectKeys() });
}
