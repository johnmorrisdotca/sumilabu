import { HeartMark } from "@/components/scorecard/heart-button";
import type { Scorecard } from "@/lib/scorecard/contract";
import { mapGroups, packageLibraries, packageRows, watchPoints } from "@/lib/scorecard/map";

import { styleOf } from "./family-style";

const th = "px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-stone-500 dark:text-stone-400";
const td = "px-2 py-1.5 align-top";
const box = "overflow-x-auto rounded-2xl border border-stone-300/80 bg-white/90 shadow-sm dark:border-stone-700 dark:bg-stone-900/90";
const dash = <span className="text-stone-400">–</span>;
const short = (name: string) => name.replace(/^@johnmorrisdotca\//, "");

function ItemLink({ id, name, favourite }: { id: string; name: string; favourite: boolean }) {
  return (
    <a href={`/packages#item=${encodeURIComponent(id)}`} className="inline-flex items-center gap-1 font-medium underline decoration-stone-300 underline-offset-2 hover:decoration-stone-700 dark:decoration-stone-600">
      {favourite ? <HeartMark /> : null}
      {short(name)}
    </a>
  );
}

/** "Package by package", one table per family in the map's order, so each family reads on its own without folding anything away. */
export function PackagesByFamily({ doc, favourites }: { doc: Scorecard; favourites: ReadonlySet<string> }) {
  return (
    <div className="grid gap-4" data-testid="packages-by-family">
      <p className="text-sm text-stone-600 dark:text-stone-300">&ldquo;Uses to run&rdquo; is what a package needs, or offers to use as an optional peer, when a page uses it. &ldquo;Demo or tests only&rdquo; never reaches a user. A dash means none.</p>
      {mapGroups(doc).map((g) => (
        <section key={g.id} aria-labelledby={`fam-${g.id}`} className={box}>
          <h3 id={`fam-${g.id}`} className="flex items-center gap-2 px-3 pt-3 text-sm font-semibold">
            <span aria-hidden className={`inline-block h-3 w-3 rounded-full ${styleOf(g.id).dot}`} />
            {g.label} · {g.items.length}
          </h3>
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                <th scope="col" className={th}>Package</th>
                <th scope="col" className={th}>On npm</th>
                <th scope="col" className={th}>What it is</th>
                <th scope="col" className={th}>Uses to run (family)</th>
                <th scope="col" className={th}>Uses to run (outside)</th>
                <th scope="col" className={th}>Demo or tests only</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((item) => {
                const row = packageRows(item);
                return (
                  <tr key={item.id} className="border-b border-stone-200/70 last:border-0 dark:border-stone-700/70" data-testid="family-row" data-item={item.id}>
                    <th scope="row" className={`${td} text-left`}><ItemLink id={item.id} name={item.name} favourite={favourites.has(item.id)} /></th>
                    <td className={`${td} font-mono text-xs`}>
                      {item.versions.npm ?? "not on npm"}
                      {item.versions.repo && item.versions.npm && item.versions.repo !== item.versions.npm ? <span className="block text-amber-700 dark:text-amber-400">{item.versions.repo} on GitHub</span> : null}
                    </td>
                    <td className={`${td} text-stone-700 dark:text-stone-300`}>{item.summary || dash}</td>
                    <td className={td}>{row.familyRun.length ? row.familyRun.map((d) => `${d.id}${d.range ? ` ${d.range}` : ""}${d.optional ? " (optional)" : ""}`).join("; ") : dash}</td>
                    <td className={td}>{row.outsideRun.length ? row.outsideRun.map((d) => `${d.name}${d.optional ? " (optional)" : ""}`).join(", ") : dash}</td>
                    <td className={td}>{row.devOnly.length ? row.devOnly.map((d) => `${d.id}${d.range ? ` ${d.range}` : ""}`).join(", ") : dash}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

/** The outside libraries: the packages' (licence, latest, how, who) and the apps' own. */
export function OutsideDependencies({ doc, favourites }: { doc: Scorecard; favourites: ReadonlySet<string> }) {
  const libs = packageLibraries(doc);
  const installed = libs.filter((l) => l.how === "installed").length;
  const nameOf = new Map(doc.items.map((i) => [i.id, i.name]));
  return (
    <div className="grid gap-4" data-testid="outside-deps">
      <p className="text-sm text-stone-600 dark:text-stone-300">
        {installed} outside {installed === 1 ? "library installs" : "libraries install"} with a package; the other {libs.length - installed} are peers a page brings itself. Licences and latest versions as npm gave them at the run.
      </p>
      <section aria-labelledby="libs-packages" className={box}>
        <h3 id="libs-packages" className="px-3 pt-3 text-sm font-semibold">Used by the packages</h3>
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700">
              {["Library", "Licence", "Latest", "How", "Used by"].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {libs.map((l) => (
              <tr key={l.name} className="border-b border-stone-200/70 last:border-0 dark:border-stone-700/70" data-testid="library-row">
                <th scope="row" className={`${td} text-left font-mono text-xs`}>{l.name}</th>
                <td className={td}>{l.license ?? <span className="text-amber-700 dark:text-amber-400">none given</span>}</td>
                <td className={`${td} font-mono text-xs`}>{l.latest ?? dash}</td>
                <td className={td}>{l.how}</td>
                <td className={td}>
                  <span className="flex flex-wrap gap-x-2">{l.usedBy.map((id) => <ItemLink key={id} id={id} name={nameOf.get(id) ?? id} favourite={favourites.has(id)} />)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section aria-labelledby="libs-apps" className={box}>
        <h3 id="libs-apps" className="px-3 pt-3 text-sm font-semibold">Used by the apps</h3>
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700">
              {["App", "Family packages", "Main outside libraries"].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {doc.apps.map((a) => (
              <tr key={a.id} className="border-b border-stone-200/70 last:border-0 dark:border-stone-700/70" data-testid="app-row">
                <th scope="row" className={`${td} text-left`}>
                  {a.item ? <a href={`/packages#item=${encodeURIComponent(a.item)}`} className="font-medium underline underline-offset-2">{a.name}</a> : a.name}
                  {a.letter ? <span className="ml-1 rounded-full border border-stone-400 px-1.5 text-[10px] font-semibold">{a.letter}</span> : null}
                  {a.private ? <span className="ml-1 text-xs text-stone-500">(private)</span> : null}
                </th>
                <td className={td}>{a.family.length ? `${a.family.length}: ${a.family.join(", ")}` : dash}</td>
                <td className={td}>{a.outside.length ? a.outside.map((n) => (doc.libraries[n]?.license && !/^MIT$/i.test(doc.libraries[n]!.license!) ? `${n} (${doc.libraries[n]!.license})` : n)).join(", ") : dash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-stone-500 dark:text-stone-400">Development tools (TypeScript, ESLint, test runners, bundlers) are left out: they never reach a user. A licence is shown beside an app&apos;s library when it is not MIT.</p>
    </div>
  );
}

/** What the data says to keep an eye on, with the open tickets about it. */
export function WatchPoints({ doc }: { doc: Scorecard }) {
  const points = watchPoints(doc);
  return (
    <div className="grid gap-3" data-testid="watch-points">
      <p className="text-sm text-stone-600 dark:text-stone-300">Worked out from this run: version ranges that miss the latest release, releases behind GitHub, large packages, red CI and licence fields. A worry the data cannot show is not listed here.</p>
      {points.length === 0 ? (
        <p className="text-sm">Nothing to watch in this run.</p>
      ) : (
        <div className={box}>
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-700">
                {["Point", "What is going on", "Tickets"].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.id} className="border-b border-stone-200/70 last:border-0 dark:border-stone-700/70" data-testid="watch-row" data-watch={p.id}>
                  <th scope="row" className={`${td} w-48 text-left font-semibold`}>{p.title}</th>
                  <td className={td}>{p.text}</td>
                  <td className={`${td} w-64`}>
                    {p.tickets.length === 0 ? dash : (
                      <ul className="grid gap-0.5">
                        {p.tickets.map((t) => (
                          <li key={t.id} className="text-xs">
                            {t.url ? <a href={t.url} className="font-mono underline">{t.id}</a> : <span className="font-mono">{t.id}</span>} {t.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
