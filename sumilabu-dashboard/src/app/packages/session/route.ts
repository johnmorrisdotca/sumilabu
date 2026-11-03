import { NextRequest, NextResponse } from "next/server";

import { VIEW_SESSION_SECONDS, WRONG_KEY_DELAY_MS, cookieHeader, keyMatches, makeViewCookie, sameOriginPost, viewKey } from "@/lib/scorecard/access";

export const runtime = "nodejs";

const MAX_FORM_BYTES = 4096;

function back(to: string, setCookie?: string): NextResponse {
  /* A relative Location, so the redirect never depends on which host name this deployment thinks it has. */
  const headers: Record<string, string> = { Location: to, "Cache-Control": "no-store" };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new NextResponse(null, { status: 303, headers });
}

/**
 * Sign in to /packages with the view key, or sign out. A form POST, same-origin
 * only. No key on the deployment: 404, as if there were no page. A wrong key
 * is answered after a second with the same redirect whatever was wrong, and
 * nothing is counted or stored.
 */
export async function POST(req: NextRequest) {
  const key = viewKey();
  if (!key) return new NextResponse("Not found", { status: 404 });
  if (!sameOriginPost(req.headers)) return new NextResponse("Forbidden", { status: 403 });

  const secure = process.env.NODE_ENV === "production";
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_FORM_BYTES) return new NextResponse("Too large", { status: 413 });
  const text = await req.text();
  if (text.length > MAX_FORM_BYTES) return new NextResponse("Too large", { status: 413 });
  const form = new URLSearchParams(text);

  if (form.get("action") === "signout") return back("/packages", cookieHeader("", 0, secure));

  if (!keyMatches(form.get("key") ?? "", key)) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_KEY_DELAY_MS));
    return back("/packages?denied=1");
  }
  return back("/packages", cookieHeader(makeViewCookie(key), VIEW_SESSION_SECONDS, secure));
}
