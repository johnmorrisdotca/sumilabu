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

The page has no sign-in (the dashboard has none) and is marked `noindex`. The
document holds no secrets by contract: it is shown on a public page.

## Setting it up, once

Schema (additive, one new table): it goes live with the deploy workflow's
`db push`; the SQL is `prisma/manual-migrations/20261102_scorecard_run.sql`.
Back production up first (AGENTS.md, "Making a change and shipping it", step 4).

The key, one command (makes it, keeps it in the keychain, puts it on Vercel as a
sensitive production variable; run before the deploy so the first deployment has it):

    T=$(openssl rand -hex 32) && printf 'add-generic-password -U -s "sumilabu SCORECARD_TOKEN" -a "%s" -w "%s"\n' "$USER" "$T" | security -i && printf '%s' "$T" | vercel env add SCORECARD_TOKEN production --sensitive --project sumilabu-dashboard --scope spxis-projects-0d6306b4

Then `pnpm scorecard:upload` after each collector run.

## Rules for the document

Every string is shown as text, never HTML; a link must be https; unknown fields
are dropped; at most 200 items; see `src/lib/scorecard/contract.ts` for every cap.

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
