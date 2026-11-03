import type { Metadata } from "next";

import { ScorecardView } from "@/components/scorecard/scorecard-view";
import { requireAdmin } from "@/lib/auth/current";
import { getScorecard } from "@/lib/scorecard/data";

/* A server render per view, but the database read is cached until a new run is
   uploaded (lib/scorecard/data.ts). Not static: the build has no database, and
   who may look is decided per request. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Package scorecard · SumiLabu",
  description: "Private.",
  robots: { index: false, follow: false },
};

/**
 * Private to John (docs/scorecard.md): Google sign-in, like every page
 * (SUMILABU-7). The gate in proxy.ts turns a stranger away first; the check
 * here comes before the read, so without a session nothing about the
 * scorecard is in the HTML or the RSC payload and a bot's visit never wakes
 * Neon. Sign out and the way back to the dashboard are in the admin toolbar.
 */
export default async function PackagesPage() {
  await requireAdmin();
  const data = await getScorecard();
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f0e8_0%,#ece6dc_52%,#e1d8cb_100%)] text-stone-900 print:bg-white">
      <main className="mx-auto max-w-[110rem] p-4 md:p-8">
        <header className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">SumiLabu</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Package scorecard</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">Every package, site and app, graded 1 to 10. Updated whenever the collector on the Mac runs and uploads.</p>
        </header>
        <ScorecardView data={data} nowIso={new Date().toISOString()} />
      </main>
    </div>
  );
}
