import type { Metadata } from "next";
import Link from "next/link";

import { MapView } from "@/components/package-map/map-view";
import { requireAdmin } from "@/lib/auth/current";
import { getScorecard } from "@/lib/scorecard/data";
import { loadFavourites } from "@/lib/scorecard/favourites-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Package map · SumiLabu",
  description: "Private.",
  robots: { index: false, follow: false },
};

/**
 * How the packages fit together (SUMILABU-11): John's 2026-11-02 document as
 * pages, drawn from the scorecard run so it stays current. Private like every
 * page: the session is checked before anything is read, so a stranger's
 * visit reads nothing. Both reads are cached (the run until the next upload,
 * the hearts until the next press).
 */
export default async function PackageMapPage() {
  await requireAdmin();
  const [data, favourites] = await Promise.all([getScorecard(), loadFavourites()]);
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f0e8_0%,#ece6dc_52%,#e1d8cb_100%)] text-stone-900 dark:bg-[linear-gradient(180deg,#1c1917_0%,#171412_60%,#0c0a09_100%)] dark:text-stone-100">
      <main className="mx-auto max-w-[110rem] p-4 md:p-8">
        <header className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.3em] text-stone-500 dark:text-stone-400">SumiLabu</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">How the packages fit together</h1>
          <p className="mt-1 max-w-3xl text-sm text-stone-600 dark:text-stone-300">
            {data
              ? `${data.doc.items.filter((i) => i.kind === "package").length} packages in ${data.doc.groups.length || "no"} families, and the apps that use them. Drawn from the scorecard run of ${data.doc.generatedAt.slice(0, 10)}; a line is what a package needs to run, a letter an app that uses it.`
              : "Drawn from the scorecard run."}
          </p>
        </header>
        {data ? (
          <MapView doc={data.doc} favourites={favourites} />
        ) : (
          <p className="rounded-2xl border border-stone-300/80 bg-white/90 p-6 text-sm dark:border-stone-700 dark:bg-stone-900/90" data-testid="map-empty">No scorecard has been uploaded yet, so there is nothing to draw.</p>
        )}
        <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
          <Link href="/packages" className="underline underline-offset-2">← Package scorecard</Link>
        </p>
      </main>
    </div>
  );
}
