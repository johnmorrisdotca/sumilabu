import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { KeyForm } from "@/components/scorecard/key-form";
import { ScorecardView } from "@/components/scorecard/scorecard-view";
import { VIEW_COOKIE, viewCookieValid, viewKey } from "@/lib/scorecard/access";
import { getScorecard } from "@/lib/scorecard/data";

/* A server render per view, but the database read is cached until a new run is
   uploaded (lib/scorecard/data.ts), so a bot's visit does not wake Neon. Not
   static: the build has no database, and who may look is decided per request. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Package scorecard · SumiLabu",
  description: "Private.",
  robots: { index: false, follow: false },
};

/**
 * Private to John (docs/scorecard.md). The data is read only after the cookie
 * is checked, so without it nothing about the scorecard is in the HTML or in
 * the page's RSC payload: a stranger gets the key form and nothing else. With
 * no SCORECARD_VIEW_KEY on the deployment the page does not exist.
 */
export default async function PackagesPage({ searchParams }: { searchParams?: Promise<{ denied?: string }> }) {
  if (!viewKey()) notFound();
  const jar = await cookies();
  const allowed = viewCookieValid(jar.get(VIEW_COOKIE)?.value);
  const denied = (await searchParams)?.denied === "1";

  if (!allowed) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f5f0e8_0%,#ece6dc_52%,#e1d8cb_100%)] px-4 text-stone-900">
        <main>
          <KeyForm denied={denied} />
        </main>
      </div>
    );
  }

  const data = await getScorecard();
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f0e8_0%,#ece6dc_52%,#e1d8cb_100%)] text-stone-900 print:bg-white">
      <main className="mx-auto max-w-[110rem] p-4 md:p-8">
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">SumiLabu</p>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Package scorecard</h1>
            <p className="mt-1 max-w-2xl text-sm text-stone-600">Every package, site and app, graded 1 to 10. Updated whenever the collector on the Mac runs and uploads.</p>
          </div>
          <form method="POST" action="/packages/session" className="print:hidden">
            <input type="hidden" name="action" value="signout" />
            <button type="submit" className="rounded-full border border-stone-300 bg-white/80 px-3 py-1.5 text-sm text-stone-700 hover:border-stone-500">
              Sign out
            </button>
          </form>
        </header>
        <ScorecardView data={data} nowIso={new Date().toISOString()} />
      </main>
    </div>
  );
}
