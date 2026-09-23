# The reports contract

One store for a member's problem reports, from any site - UmaKuma first,
Itsutsu building against the same contract next. Reached under
`/api/v1/projects/{key}/reports`, beside `.../tickets` and `.../settings`
(`docs/board/BOARD_RULES.md`), with its own token map so the three stay
apart from each other: a leaked reports key cannot move a board ticket or
change a setting, and a leaked board or settings key does not read reports.

## Columns

| Field | Notes |
|---|---|
| `id` | cuid. Every write addresses the id. |
| `projectKey` | Required, no default - a row with no owning project is exactly what this must never allow. |
| `body` | 3 to 4,000 characters. What the member wrote. |
| `path` | At most 500 characters. The page the member had open. **The client strips everything after `?` before sending it** - a query string can hold a private link, session token or similar, and the service never sees it. |
| `appVersion` | At most 40 characters. Optional. |
| `reporterRef` | At most 200 characters. **Required on every create, including a signed-out reporter.** An opaque id the client mints - never a name, an email or an IP address, and never anything that identifies a person on its own. See "Reporter identity" below. |
| `reporterName` | At most 80 characters. Optional; what to show a human, if the client has one to offer. Null for a signed-out reporter. |
| `status` | `new`, `read`, `filed`, `closed`. See "Moves" below. |
| `filedTicketId` | Set only by `POST reports/{id}/file`, together with `status = "filed"`. |
| `adminNote` | At most 4,000 characters. An admin's own note; never shown to the reporter. |
| `createdAt`, `updatedAt` | |

## Reporter identity

A report must be possible for a visitor who has never signed in, so
`reporterRef` cannot be an account id. The client mints a random, opaque id
and keeps it (a cookie or `sessionStorage` on UmaKuma; whatever a site's own
storage story is) - stable enough to rate-limit a repeat reporter, and
nothing else. **A site must never send personal data in `reporterRef` or
`reporterName`** - no email, no IP address, no account id encoded any way a
reader could decode. `reporterName` is the one field allowed to identify
someone, and only because it is optional and exists purely so an admin has a
name to read; a client that has no name to offer sends null.

## Moves

| From | PATCH may reach | Notes |
|---|---|---|
| `new` | `read`, `closed` | |
| `read` | `closed` | |
| `filed` | `closed` | Filed reports can still be closed once the linked ticket is done. |
| `closed` | nowhere | Terminal. |

`filed` is not a `PATCH` target. It is written only by
`POST reports/{id}/file`, together with `filedTicketId`, in the same shape
`BoardTicket`'s `done` is reached only through the ship route and never
through `PATCH tickets/{id}` (`BOARD_RULES.md` invariant 1). A `PATCH`
naming `status: "filed"` is refused by the schema itself, 400, before
anything is read.

## Filing

`POST reports/{id}/file` creates a `BoardTicket` in the same project and
links it to the report - `status = "filed"`, `filedTicketId` - in one
transaction: either both writes land, or neither does. A report already
`filed` or `closed` refuses, 409 `not_fileable`, and creates no ticket. The
body may override `title`, `detail` and `kind`; anything omitted is derived
from the report (`body` becomes the ticket's `detail`, along with the page,
version and reporter name/ref; `kind` defaults to `fix`).

**Filing needs the board token, not the reports token.** Filing a report is
creating a board ticket, so the same guarantee that keeps a leaked board key
from reading settings keeps a leaked reports key from filing: it can create,
read, list, patch and delete a project's own reports, but never write to the
board. A site's admin surface, which already holds a board token for its own
ticket actions, is what calls this route.

## Rate limiting

Counted against the `Report` table itself, not a second table or an
in-memory store - a `count` query in the same window a create already
writes to. No Redis, anywhere, ever (a standing rule on every site here).

| Scope | Limit |
|---|---|
| Per `reporterRef` | 5 creates per 10 minutes |
| Per `projectKey` | 200 creates per hour |

A create over either limit is refused before anything is written: 429
`{ ok: false, error: "rate_limited", scope: "reporter" | "project",
retryAfterMs }`, with a `Retry-After` header in seconds.

## Health, and what a client does with it

`GET /api/v1/health` runs one `SELECT 1` and answers `{ ok: true }` or 503.
It requires a reports token (any project's - `authorizeAnyBoard`), because an
unauthenticated route that touches the database on every hit can be hammered
by anyone, and the CPU it costs is shared with every other project on this
account. It always answers `Cache-Control: no-store`; the response is meant
to be cached, but by the *caller*, never by anything in between.

**Expected client behaviour**, so a member never types into a form that
cannot take it, and so Itsutsu's port matches UmaKuma's:

- Check health once, when the report dialog opens. Never poll, and never on
  page load.
- Cache the answer on the client's own server for about 30 seconds, so a
  burst of opens in that window makes one call, not one per open.
- Time the request at about 2 seconds; a timeout counts as down.
- When the check says down (or times out), the dialog shows a calm "paused,
  try again later" message in place of the form - nothing can be typed or
  submitted. "Could not send" is for the rarer case: the check passed, but
  sending itself failed before or during the request (Sumilabu went down in
  the gap, or the create call itself times out or rate-limits). That case
  keeps the member's typed text in the box; nothing is lost silently, and
  there is no local fallback store on the client - the report is retried
  against this service or not sent at all, never written somewhere else.

## Tokens and projects

A third token map, alongside `BOARD_TOKENS_JSON` and `SETTINGS_TOKENS_JSON`:
`REPORTS_TOKENS_JSON`, same `{ "<projectKey>": "<token>" }` shape. It
authorizes every reports route except `POST reports/{id}/file`, which takes
the board token instead (see "Filing" above). Every project may also hold a
`<key>-dev` entry, the same as the other two maps, so a test run never
touches a real project's reports.

Only a site's own server holds a reports (or board) token - the browser
never does, and never calls these routes directly. A member's report goes
through the site's own API, which forwards it here.

## Out of scope for this pass

- Moving the storage further than "one service, three token-scoped families"
  - a shared reports UI across sites, say - is a later pass once Itsutsu is
    actually consuming this API, not assumed now.
