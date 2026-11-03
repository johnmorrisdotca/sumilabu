import type { Metadata } from "next";

import { ScorecardView } from "@/components/scorecard/scorecard-view";
import { getScorecard } from "@/lib/scorecard/data";

/* A server render per view, but the database read is cached until a new run is
   uploaded (lib/scorecard/data.ts), so a bot's visit does not wake Neon. Not
   static: the build has no database, and the age of the data is computed at
   request time. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Package scorecard · SumiLabu",
  description: "Grades for every package and site, updated whenever the collector runs.",
  robots: { index: false, follow: false },
};

export default async function PackagesPage() {
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
