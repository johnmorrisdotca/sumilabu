# Package scorecard (`/packages`)

A page at `https://app.sumilabu.com/packages` that grades every package, site
and app John owns from 1 to 10 (ticket SUMILABU-6). A collector on John's Mac
(`~/Projects/backups/package-scorecard/`) measures them and writes
`latest.json`; this site only stores and shows it.

## How data reaches the page

1. The collector writes `latest.json` (the contract is at the end of this file).
2. `pnpm scorecard:upload` (from `sumilabu-dashboard/`) POSTs it to
   `POST /api/v1/scorecard` with `Authorization: Bearer <SCORECARD_TOKEN>`. The
   key is read from the keychain item `sumilabu SCORECARD_TOKEN` (or
   `$SCORECARD_TOKEN`) and handed to curl on standard input, so it is never in
   `ps`, the output or a file. `SCORECARD_URL` and `SCORECARD_FILE` override the
   address (https, or http on localhost) and the file.
3. The route checks, cheapest first: the token (no `SCORECARD_TOKEN` on the
   deployment means 401 for everyone), the declared size (413 over 1 MiB), the
   body size, JSON (400 `invalid_json`), the contract (422 `invalid_payload`
   with up to ten `problems`), a `generatedAt` no more than a day ahead. Only
   then does it reach Postgres.
4. One row per run in `ScorecardRun`, unique on `generatedAt` (the same run
   sent twice replaces itself); the newest ten are kept, the rest deleted. The
   upload clears the `scorecard` cache tag.
5. The page reads the latest run and the older runs' `overall` column through
   Next's data cache (`lib/scorecard/data.ts`), so it costs a database read only
   the first view after an upload. Nothing here is on a timer, so Neon is never
   woken by it. A fresh deployment shows "No scorecard has been uploaded yet"
   until the first upload.

## Who can see the page

`/packages` is private to John, like every page of the site: Google sign-in
with an address on `SUMILABU_ADMIN_EMAILS` (SUMILABU-7, 2026-11-03; how it
works is in `AGENTS.md`, "Who may use the site"). The gate in `src/proxy.ts`
sends anyone else to `/signin` before the page runs, and the page itself checks
the session again before it reads anything, so a signed-out response holds
nothing about the scorecard in its HTML or RSC payload and never wakes Neon.
There is no API route that returns the scorecard. Sign out is in the admin
toolbar at the top of every page. The page stays `noindex`.

The view key that opened it until then (`SCORECARD_VIEW_KEY`, its form and
`POST /packages/session`) is gone; nothing reads that variable any more, and it
can be deleted from Vercel and the keychain whenever convenient.

## What the page does besides the table (2026-11-03)

- **Favourites** (SUMILABU-9). A heart on every row, phone card and detail
  header; favourites come first in every list, each part in the current sort,
  and the "Favourites (n)" chip (`#tab=table&filter=favourites`) shows only
  them. The hearts are kept on the server so they follow John across devices:
  one row of the settings store (`BoardSetting`, project key `_sumilabu-site`,
  key `scorecard.favourites`; no settings token is issued for that key, so the
  token API cannot reach it). No schema change. The page reads the list in the
  same render as the run, both cached; a heart is `POST /packages/favourites
  { id, on }`, which needs John's session, a same-origin request (`Origin`
  naming the host, `Sec-Fetch-Site: same-origin` when sent, JSON only) and,
  to add, an id of the current run. The page changes the heart at once and
  puts it back with a short message if the save fails.
- **Pictures** (SUMILABU-8). `links.icon` in a row and on the map, else the
  card cropped; `links.thumbnail` (and `thumbnailDark` when the page is dark)
  on a phone card and the detail header. Plain lazy `<img>` with its size set;
  the browser loads them from the item's own Pages or repository host and the
  server never fetches one. There is no Content-Security-Policy on the pages,
  so none had to be widened.
- **The view is remembered** (SUMILABU-10), per browser, in localStorage under
  `sumilabu.scorecard.view` (`{ v: 1, ... }`; every field checked on its own,
  a bad one falls back alone, a new `v` drops them all): the tab, the sort, the
  filter chips and search, the ranking, the detail tab, and the ticket views'
  sort and filters. What the address names wins over what was stored, field by
  field (`#item=jirai&dtab=numbers`, `#tab=rankings&rank=docs`). "Reset view"
  forgets it. The server cannot see the browser's storage, so a small inline
  script hides the lists, only when something is stored or the address names
  a view, until the page has applied it before its first paint; CSS shows them
  after 1.5 s whatever happens.
- **Tickets** (SUMILABU-12). A summary at the top (a sentence, four figures, a
  bar of open tickets by kind, done per day when the boards give dates), a
  Tickets tab comparing every item (sortable, chips: has bugs, has critical,
  nothing open), small badges on each row, and in each item's detail, under the
  grade cards, its figures, its open critical and high tickets and its full
  list. Every ticket is also listed under the main table with a package
  filter. The boards give no dates or done tickets yet, so those parts say so.
- **A radar of the grades** beside an item's Overall, against its family's
  median, and a tiny one in each row. Rankings draw real bars.
- **The package map** at `/packages/map` (SUMILABU-11): John's 2026-11-02
  document "How the packages fit together" drawn from the run (`groups`,
  `apps`, `libraries`, `dependencies.familyRanges`): the map, package by
  package, outside dependencies and watch points, as tabs (`#tab=watch`).

## Setting it up, once

Schema (additive, one new table): it goes live with the deploy workflow's
`db push`; the SQL is `prisma/manual-migrations/20261102_scorecard_run.sql`.
Back production up first (AGENTS.md, "Making a change and shipping it", step 4).

The upload key, one command (makes it, keeps it in the keychain, puts it on Vercel
as a sensitive production variable, the value only ever on standard input; run
before the deploy so the first deployment has it):

    for n in SCORECARD_TOKEN; do T=$(openssl rand -hex 32) && printf 'add-generic-password -U -s "sumilabu %s" -a "%s" -w "%s"\n' "$n" "$USER" "$T" | security -i && printf '%s' "$T" | vercel env add "$n" production --sensitive --project sumilabu-dashboard --scope spxis-projects-0d6306b4 || break; done

Then `pnpm scorecard:upload` after each collector run, and open `/packages`
signed in with Google.

## Rules for the document

Every string is shown as text, never HTML; a link must be https; unknown fields
are dropped; at most 200 items; see `src/lib/scorecard/contract.ts` for every cap.
The additions in the notes below (`skipped`, `run`, `private`, `starsOutside`,
`downloadsDaily`, `checkNotes` and the rest) are all accepted; `downloadsDaily`
and `checkNotes` are the only measures that may be lists (numbers, sentences).
A document without them still parses.

---

## The data contract

Shared by the collector (SUMILABU-6, part 1) and the page on app.sumilabu.com (part 2). Change it only with a note at the end saying what changed and why.

One run writes `~/Projects/backups/package-scorecard/<yyyy-mm-dd>/scorecard.json` (and `latest.json` beside this file, a copy). UTF-8 JSON, no comments.

```
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-02T23:00:00Z",          // ISO, UTC
  "generator": { "name": "package-scorecard", "version": "1.0.0" },
  "methods": { "<measure id>": "one or two plain sentences: how it is read or graded" },
  "items": [
    {
      "id": "kazoku-ui",                           // repo name, unique
      "kind": "package" | "site" | "app",          // package = on npm; site/app = deployed or private
      "owner": "johnmorrisdotca" | "spxis",
      "name": "@johnmorrisdotca/kazoku-ui" | "itsutsu.com",
      "summary": "one line, what it is",
      "links": { "repo": "...", "npm": "...", "demo": "...", "site": "..." },   // only those that exist
      "versions": { "npm": "0.10.1" | null, "repo": "0.10.1" | null, "count": 12 | null },
      "dates": {
        "lastCommit": "2026-11-02" | null, "lastRelease": "2026-11-02" | null,
        "created": "2026-10-20" | null, "daysSinceCommit": 0 | null, "daysSinceRelease": 0 | null
      },
      "popularity": {
        "npmDownloadsWeek": 123 | null, "npmDownloadsMonth": 456 | null,
        "stars": 0 | null, "forks": 0 | null, "watchers": 0 | null,
        "dependentsOutsideFamily": 0 | null,
        "note": "what the counts include (own installs, CI, mirrors) and what could not be separated"
      },
      "dependencies": {
        "runtime": ["d3-geo"], "optionalPeers": ["three"], "family": ["chizu"], "dev": 14,
        "packedKb": 120 | null, "unpackedKb": 480 | null
      },
      "measures": {                                // raw numbers behind the grades; null = not read
        "readmeWords": 2100, "docsSite": true, "examplesTested": true, "changelog": true,
        "testFiles": 12, "tests": 168, "e2e": true, "freezeTest": true,
        "ciRunsLast30": 20, "ciFailuresLast30": 3,
        "openBugTickets": 2, "openTickets": 9, "lintErrors": 0 | null, "lintWarnings": 12 | null,
        "typeErrors": 0 | null, "anyCount": 3 | null, "largestFileLines": 640,
        "auditHigh": 0 | null, "bundleGzipKb": 8.1 | null
      },
      "grades": {                                  // 1 (worst) to 10 (best), or null when it cannot be judged
        "docs": 8, "dependencies": 9, "robustness": 7, "tests": 8, "bugs": 7, "crashes": 9,
        "code": 7, "lint": 8, "performance": 7, "usefulness": 6, "freshness": 9, "overall": 8
      },
      "gradeNotes": { "<grade id>": "why this number, in one sentence" },
      "facts": ["ten short facts about this item, plain sentences"],
      "flags": ["needs linting", "not updated for 45 days", ...]
    }
  ],
  "rankings": { "<grade or measure id>": { "best": ["id", ...], "worst": ["id", ...] } }
}
```

Rules
- No secrets, tokens, private addresses or private code in the file: it is shown on a web page.
- A measure nobody could read is null, never a guess. Every grade has a note.
- "Robustness" is the opposite of fragile. "Crashes" counts real failures seen (CI runs, freeze tests, tickets about crashes), not opinions.
- Downloads from npm include the owner's own installs and CI; say so in `popularity.note`.

## Notes

**2026-11-02, collector 1.0.0 (Mac Studio).** Additions only; every field above keeps its shape and meaning, so a page written to the shape above still works.

- Top level: `skipped` (`[{ "repo": "spxis/bootstrap", "reason": "a fork of someone else's project" }]`, the repositories left out and why) and `run` (`{ seconds, githubRateLimited, boardsRead: { <board>: true|false }, installsRun }`). John asked what was skipped; the page can show both.
- Item: `private` (true for a private repository). Shown so the page can say why CI, demos or downloads are blank.
- `popularity`: `starsOutside` and `forksOutside`, the stars and forks from accounts other than johnmorrisdotca and spxis. John asked for use "besides my 2 users"; `stars` and `forks` stay the totals.
- `dependencies`: `requiredPeers` (non-optional peers, counted in the dependencies grade).
- `measures`: extra raw readings beside the listed ones: `readmeSections`, `docsPages`, `docsGuidesJa`, `sourceFiles`, `sourceLines`, `testLines`, `crashTickets`, `ciLastFailedOnMain`, `lintConfig` (false = no linter set up), `formatter`, `lintNote`, `typescript`, `tsFraction`, `tsStrict`, `anyPer1k`, `largestFile`, `filesOver600`, `todoCount`, `consoleLogs`, `auditModerate`, `bundleEntry`, `familyUsers` (how many family items use it), `behindRepo`, `demoStatus`, `demoMs`, `siteStatus`, `siteMs`, `siteKb`, `siteChallenged` (true when Vercel's bot check met the request), `downloadsDaily` (30 daily npm counts, oldest first, for a sparkline) and `checkNotes` (why lint, typecheck or audit is blank). `bundleGzipKb` is the gzip size of the main entry plus every file it imports statically, read from the published tarball.
- `facts` holds 10 to 14 sentences (a moved-repository note may come first).
- `rankings`: besides every grade id, `downloads`, `dependencyCount`, `daysSinceCommit`, `tests`, `packedKb`, `openBugTickets` and `readmeWords`. For grades best is highest; for those measures best is the end John wants (most downloads, fewest dependencies, most recent, most tests, smallest, fewest bugs, longest README). Five ids each side.
- `methods` keys: every grade id plus `npmDownloads`, `outsideUse`, `ciRuns`, `tickets`, `codeReadings`, `rankings`.

**2026-11-03, collector 1.1.0 (Mac Studio).** Additions only; `schemaVersion` stays 1, every new field is optional with the default given, and a page written to the shapes above still works. For the package map (SUMILABU-11) and the ticket report (SUMILABU-12).

- `links.thumbnail`, `links.thumbnailDark`, `links.icon` (default: absent): https images, only on `*.github.io`, `raw.githubusercontent.com` or the host of the item's own `links.site` or `links.demo`, with no login or port. The collector drops anything else, because the page refuses a whole run for one. Found in order: the family's `thumbnail.png`, `thumbnail-dark.png`, `icon.png` on GitHub Pages, else the README's first image that is a file in the repository, else a public site's own `og:image`. Private repositories get none.
- `group` (default null): the package's family on the map, `^[a-z0-9-]{1,40}$`, from `config.json`; a package with none is `other`. Sites and apps are null.
- `license` (default null): the licence in the repository's package.json, else npm's; null when neither declares one.
- `dependencies.familyDev` (default []): family packages that only the repository's devDependencies or its demo sub-packages use.
- `dependencies.familyRanges` (default {}): the range as written for every family package in dependencies, peerDependencies, optionalDependencies and devDependencies of the repository's package.json (an app's package.json files too), plus a demo sub-package's when the root does not name it; npm's manifest when there is no repository. At most 100.
- `tickets` (default null = no board read for the item): `{ boards, open, inProgress, waitingOnJohn, doneLast7, doneLast30, oldestOpenDays, openByKind: { bug|feature|chore|other: { critical, high, medium, normal, low, unset } }, urgent: [ticket], recentDone: [ticket] }`, with `ticket = { id, title (120), kind, kindDerived, priority, status: waiting | in progress | waiting on John | done, created, done, url }`. Today `waitingOnJohn`, `doneLast30`, `oldestOpenDays`, `created`, `done` and `url` are null and `recentDone` is empty: no task command prints rows as JSON, so only open tickets are read and no board marks a ticket as waiting on John or has a page per ticket. `doneLast7` is a number only where `pnpm task status --json` covers every board the item's tickets come from, else null. `urgent` is open critical and high tickets, critical first (no dates to sort by).
- Every tickets block (items' `tickets` and `familyTickets`) also has `list` (default []): every open ticket of the block, at most 400, by priority (critical, high, medium, normal, low, unset), then oldest first where a date exists, else the board's own order; done tickets join it once a board gives them. Every ticket (in `list`, `urgent` and `recentDone`) also has `claimedBy` (who holds it, up to 80 characters, or null) and `detail` (the ticket's detail text, up to 4,000 characters, or null when the board's listing does not give it: Itsutsu's does not).
- Size: the file stays under 950 KB in all (the upload takes at most 1 MiB, which is not raised). When it would not, the longest ticket details are cut first, on a word boundary ending with "…", to the highest common length that fits, and the run says how many were cut.
- Top level `groups` (default []): `[{ id, label }]` in display order, at most 20.
- Top level `apps` (default []): `[{ id, letter, name, note, item, private, onMap, family, outside }]`, at most 20: every site and app in config plus hotarutv.com (hotaru's `web/`). `family` is the family packages in its run-time dependencies; `outside` its other run-time dependencies without build, test and lint tools, sorted, at most 40.
- Top level `libraries` (default {}): `{ "<npm name>": { license, latest } }` for every outside name in the packages' `runtime`, `requiredPeers`, `optionalPeers` and the apps' `outside`, at most 400.
- Top level `familyTickets` (default null): a tickets block for tickets on shared boards that name no item.
- Ticket titles and details of private repositories are in the data because the page is private behind Google sign-in. They must never go into a public file.
- `measures.openTickets`, `openBugTickets` and `crashTickets` keep their rules; they now count the same tickets as the `tickets` block (a shared-board ticket that names an item as a whole word now counts for it, where before only a title prefix did).
