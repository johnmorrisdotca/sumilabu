"use client";

import { useState } from "react";

import { Thumb } from "@/components/scorecard/thumb";
import type { Scorecard } from "@/lib/scorecard/contract";
import { packageLibraries } from "@/lib/scorecard/map";
import { mapLayout } from "@/lib/scorecard/map-layout";

import { FAMILY_ICON, PLAIN_ICON, styleOf } from "./family-style";

const HEART = "M12 20.5s-7.5-4.6-9.3-9.3C1.4 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.3 4.3 6.7-1.8 4.7-9.3 9.3-9.3 9.3z";

/**
 * The package map (SUMILABU-11) drawn from the run: the apps with their
 * letters, each family as a coloured box, a pill per package with the letters
 * of the apps that run on it, and the run-time links (solid: needed to run;
 * dashed: an optional peer). Each pill opens the package's scorecard; a
 * favourite carries its heart. Hovering or focusing a pill shows its picture
 * in one place beside the map, so only the picture asked for is loaded.
 * On a phone the map keeps its size and scrolls inside its own box.
 */
export function PackageMap({ doc, favourites }: { doc: Scorecard; favourites: readonly string[] }) {
  const layout = mapLayout(doc);
  const favs = new Set(favourites);
  const [hover, setHover] = useState<string | null>(null);
  const hovered = hover ? doc.items.find((i) => i.id === hover) : undefined;
  const libraries = packageLibraries(doc);
  const groupLabel = new Map(doc.groups.map((g) => [g.id, g.label]));
  const hubUsers = layout.hub ? doc.items.filter((i) => i.id !== layout.hub && (i.dependencies.family.includes(layout.hub!) || i.dependencies.familyDev.includes(layout.hub!))) : [];
  const hubDemoOnly = hubUsers.filter((i) => !i.dependencies.family.includes(layout.hub!)).length;
  const pillsOf = new Map(layout.pills.map((p) => [p.id, p]));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4" data-testid="package-map">
      <div className="relative rounded-2xl border border-stone-300/80 bg-white/90 p-2 shadow-sm dark:border-stone-700 dark:bg-stone-900/90">
        <div className="overflow-auto">
          <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="h-auto w-full min-w-[900px]" role="img" aria-labelledby="map-title map-desc">
            <title id="map-title">The package families and the apps that use them</title>
            <desc id="map-desc">
              {layout.groups.map((g) => `${g.label}: ${g.count} packages.`).join(" ")} {layout.links.length} run-time links between packages, {layout.links.filter((l) => l.optional).length} of them optional. The tables in the next tabs say the same in words.
            </desc>
            <defs>
              <marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="fill-stone-500 dark:fill-stone-400" />
              </marker>
            </defs>

            {layout.appLines.map((l) => (
              <path key={`${l.app}-${l.group}`} d={l.d} className="fill-none stroke-stone-300 dark:stroke-stone-600" strokeWidth="1.5" markerEnd="url(#map-arrow)" />
            ))}

            {layout.apps.map((a) => (
              <g key={a.id} data-map-app={a.id}>
                <rect x={a.x} y={a.y} width={a.w} height={a.h} rx="12" className="fill-stone-100 stroke-stone-300 dark:fill-stone-800 dark:stroke-stone-600" strokeWidth="1.5" strokeDasharray={a.hasFamily ? undefined : "5 4"} />
                {a.letter ? (
                  <>
                    <circle cx={a.x + 24} cy={a.y + a.h / 2} r="11" className="fill-white stroke-stone-400 dark:fill-stone-900 dark:stroke-stone-500" />
                    <text x={a.x + 24} y={a.y + a.h / 2 + 4} textAnchor="middle" className="fill-stone-700 text-[11px] font-semibold dark:fill-stone-200">{a.letter}</text>
                  </>
                ) : null}
                <text x={a.x + (a.letter ? 44 : 16)} y={a.y + 23} className="fill-stone-900 text-[14px] font-semibold dark:fill-stone-50">{a.name}</text>
                <text x={a.x + (a.letter ? 44 : 16)} y={a.y + 41} className="fill-stone-500 text-[11px] dark:fill-stone-400">{a.hasFamily ? a.note : a.note || "no family packages"}</text>
              </g>
            ))}

            {layout.groups.map((g) => {
              const st = styleOf(g.id);
              const cx = g.tall ? g.x + g.w / 2 : g.x + g.w / 2;
              return (
                <g key={g.id} data-map-group={g.id}>
                  <rect x={g.x} y={g.y} width={g.w} height={g.h} rx="22" className={st.box} strokeWidth="1.5" />
                  <circle cx={cx} cy={g.y + 26} r="17" className={st.iconBg} strokeWidth="1.25" />
                  <g transform={`translate(${cx - 10} ${g.y + 16}) scale(${20 / 24})`}>
                    <path d={FAMILY_ICON[g.id] ?? PLAIN_ICON} className={`fill-none ${st.icon}`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                  <text x={cx} y={g.y + 63} textAnchor="middle" className="fill-stone-900 text-[14px] font-semibold dark:fill-stone-50">
                    {g.label} · {g.count}
                  </text>
                </g>
              );
            })}

            {layout.links.map((l) => (
              <path key={`${l.from}-${l.to}`} d={l.d} className="fill-none stroke-stone-500 dark:stroke-stone-400" strokeWidth="1.4" strokeDasharray={l.optional ? "5 4" : undefined} markerEnd="url(#map-arrow)" data-map-link={`${l.from}>${l.to}`} data-optional={l.optional} />
            ))}

            {layout.pills.map((p) => {
              const st = styleOf(p.group);
              const fav = favs.has(p.id);
              const textX = p.x + p.w / 2 - (p.letters.length * 11) / 2 + (fav ? 6 : 0);
              return (
                <a
                  key={p.id}
                  href={`/packages#item=${encodeURIComponent(p.id)}`}
                  aria-label={`${p.id}${fav ? ", favourite" : ""}${p.letters.length ? `, used by app ${p.letters.join(" and ")}` : ""}${p.unused ? ", no app uses it yet" : ""}: open its scorecard`}
                  onMouseEnter={() => setHover(p.id)}
                  onFocus={() => setHover(p.id)}
                  onMouseLeave={() => setHover((h) => (h === p.id ? null : h))}
                  className="outline-none [&:focus-visible>rect]:stroke-sky-600 [&:focus-visible>rect]:stroke-[3]"
                  data-map-pill={p.id}
                >
                  <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.h / 2} className={p.hub ? "fill-sky-100 stroke-sky-600 dark:fill-sky-900 dark:stroke-sky-400" : st.pill} strokeWidth={p.hub ? 2.5 : 1.25} strokeDasharray={p.unused ? "4 3" : undefined} />
                  {fav ? (
                    <g transform={`translate(${p.x + 9} ${p.y + p.h / 2 - 6}) scale(0.5)`} data-map-heart>
                      <path d={HEART} className="fill-rose-600 dark:fill-rose-400" />
                    </g>
                  ) : null}
                  <text x={textX} y={p.y + p.h / 2 + 4.5} textAnchor="middle" className={`text-[13px] ${p.hub ? "fill-sky-950 font-bold dark:fill-sky-50" : st.text}`}>
                    {p.id}
                  </text>
                  {p.letters.map((letter, i) => {
                    const cx = p.x + p.w - 14 - (p.letters.length - 1 - i) * 21;
                    return (
                      <g key={letter}>
                        <circle cx={cx} cy={p.y + p.h / 2} r="9" className="fill-white/90 stroke-stone-400 dark:fill-stone-900 dark:stroke-stone-500" />
                        <text x={cx} y={p.y + p.h / 2 + 3.5} textAnchor="middle" className="fill-stone-700 text-[10px] font-semibold dark:fill-stone-200">{letter}</text>
                      </g>
                    );
                  })}
                </a>
              );
            })}
          </svg>
        </div>
        {hovered ? (
          <div className="pointer-events-none absolute right-4 top-4 hidden w-64 rounded-xl border border-stone-300 bg-white p-2 shadow-lg md:block dark:border-stone-600 dark:bg-stone-900" data-testid="map-preview">
            <Thumb item={hovered} size="card" />
            <p className="mt-1 text-sm font-semibold">{hovered.name}</p>
            <p className="text-xs text-stone-600 dark:text-stone-300">{hovered.summary}</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="text-sm text-stone-700 dark:text-stone-200">
          {layout.hub ? (
            <p>
              <span className="font-semibold">{layout.hub}</span> is the package the others lean on: {hubUsers.length} packages use it, {hubDemoOnly} of them only in their demos and tests. {pillsOf.get(layout.hub)?.letters.length ? "" : "No app uses it directly."}
            </p>
          ) : null}
        </div>
        <dl className="grid gap-1 rounded-2xl border border-stone-300/80 bg-white/90 p-3 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-200" aria-label="How to read the map">
          <div className="flex items-center gap-2"><svg width="40" height="8" aria-hidden><line x1="0" y1="4" x2="40" y2="4" className="stroke-stone-500" strokeWidth="1.5" /></svg><dt className="sr-only">solid line</dt><dd>needs it to run</dd></div>
          <div className="flex items-center gap-2"><svg width="40" height="8" aria-hidden><line x1="0" y1="4" x2="40" y2="4" className="stroke-stone-500" strokeWidth="1.5" strokeDasharray="5 4" /></svg><dt className="sr-only">dashed line</dt><dd>optional peer</dd></div>
          <div className="flex items-center gap-2"><span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-stone-400 text-[10px] font-semibold">I</span><dt className="sr-only">letter</dt><dd>an app that runs on it</dd></div>
          <div className="flex items-center gap-2"><span aria-hidden className="inline-block h-4 w-10 rounded-full border border-dashed border-stone-400" /><dt className="sr-only">dashed pill</dt><dd>no app uses it yet</dd></div>
        </dl>
      </div>

      <section aria-labelledby="libs-title">
        <h3 id="libs-title" className="mb-2 text-sm font-semibold">Outside libraries they pull in <span className="font-normal text-stone-500 dark:text-stone-400">(dot = the family that needs it)</span></h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="library-cards">
          {libraries.map((lib) => (
            <li key={lib.name} className="rounded-xl border border-stone-300/80 bg-white/90 px-3 py-2 dark:border-stone-700 dark:bg-stone-900/90">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                {lib.groups.map((g) => (
                  <span key={g} title={groupLabel.get(g) ?? g} className={`inline-block h-2.5 w-2.5 rounded-full ${styleOf(g).dot}`} />
                ))}
                <span className="sr-only">pulled in by {lib.groups.map((g) => groupLabel.get(g) ?? g).join(", ")}:</span>
                {lib.name}
              </p>
              <p className="text-xs text-stone-600 dark:text-stone-300">
                {lib.how} · {lib.usedBy.length === 1 ? lib.usedBy[0] : `${lib.usedBy.length} packages`}
                {lib.license ? ` · ${lib.license}` : ""}
              </p>
            </li>
          ))}
          <li className="rounded-xl border border-stone-300/80 bg-white/90 px-3 py-2 dark:border-stone-700 dark:bg-stone-900/90">
            <p className="text-sm font-semibold">The apps</p>
            <p className="text-xs text-stone-600 dark:text-stone-300">their own libraries: see Outside dependencies</p>
          </li>
        </ul>
      </section>
    </div>
  );
}
