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
