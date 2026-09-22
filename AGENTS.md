# SumiLabu monorepo

Two things live here, with different tools and different deploy paths:

| Folder | What | Deploys by | Guide |
|---|---|---|---|
| `sumilabu-dashboard/` | Next.js + Neon site: telemetry ingest and dashboard (`app.sumilabu.com`), and the shared tickets board and settings store itsutsu and umakuma use (`api.sumilabu.com`) | a push to `master` touching `sumilabu-dashboard/**` — GitHub Actions runs the Vercel CLI (`.github/workflows/vercel-deploy.yml`) | `sumilabu-dashboard/AGENTS.md` — **read it before touching the site** |
| `firmware/` | MicroPython for the InkyFrame 7.3 / 5.7 clocks, the Pico Unicorn Pack and Pico Display 2 | you, over USB, with the scripts below | `README.md` (this folder) |

The repository is public. Secrets live in `firmware/secrets.py` (ignored),
`sumilabu-dashboard/.env.local` (ignored), Vercel's environment and the
repository's Actions secrets — never in a tracked file.

## Firmware, in short

- Tools: `python3 -m pip install --user mpremote` (and `mpy-cross` for
  precompiled builds, `MPY_COMPILE=true`). A venv at `.venv-tools/` is used
  when present.
- Config: `cp firmware/secrets.py.example firmware/secrets.py`, then Wi-Fi,
  `STATS_API_URL`/`STATS_API_TOKEN`, `DEVICE_PROFILE`, `HARDWARE_TARGET`,
  `STATS_DEVICE_ID`, `STATS_PROJECT_KEY`. `STATS_INTERVAL_SECONDS` is never
  below 900: every heartbeat is a server call and a stored row.
- Deploy one device by profile (each script writes a temporary `secrets.py`
  for that device, deploys, runs the probe gates, resets the board, and puts
  your own `secrets.py` back):

  | Script | Profile | Device |
  |---|---|---|
  | `./deploy_office.sh` | `office` | InkyFrame 7.3, `dual` layout, project `inkyframe` |
  | `./deploy_japan57.sh` | `japan57` | InkyFrame 5.7, `japan` layout, project `inkyframe-japan` |
  | `./deploy_unicorn.sh [--port …]` | `unicorn4` | Pico Unicorn Pack, project `pico-unicorn` |
  | `./deploy_pico_display2.sh [--port …]` | `pico_display2` | Pico Display Pack 2 |
  | `./deploy_safe.sh` | your `secrets.py` as it is | rebuilds bitmaps, deploys, probes, resets |
  | `./deploy_recover_gate.sh` | — | recovery path when a board will not boot the app |

  The profiles are registered in `firmware/deploy/profile_registry.py`; the
  scripts call `firmware/tools/deploy_profile.py --profile <name>`.
- **Two boards plugged in: pass `--port /dev/cu.usbmodemXXXX`** (or
  `PORT=…` for `deploy_safe.sh`) so you do not flash the wrong one.
- A firmware change deploys nothing on the web: the workflow's `paths`
  filter ignores it. A firmware push is free.

## Working in this repository

- The branch is `master`. `git pull --ff-only` first; stage files by name,
  never `git add -A` — the root usually carries in-progress hardware files.
- Commit messages: `type(scope): summary` (`feat`, `fix`, `perf`, `chore`,
  `docs`; scopes `board`, `dashboard`, `firmware`, `ui`, `ci`), a body that
  says why, and **no trailers of any kind** — no `Co-Authored-By`, nothing
  naming an AI. That is a standing rule in every SPXIS repository and it
  overrides any tool's own attribution reminder.
- Anything that costs on Vercel — a deployment, a server render, a poll, a
  kept deployment — is shared with four other projects on one Hobby account.
  `sumilabu-dashboard/AGENTS.md` has the rules and the incidents behind them.
