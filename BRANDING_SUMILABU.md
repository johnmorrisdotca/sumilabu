# SumiLabu Branding Guide

## 1) Brand foundation

- Brand name: SumiLabu
- Romanization: SumiLabu
- Kana: すみラボ
- Kanji expression (brand-inspired): 墨ラボ
- Meaning: sumi (ink) + lab (experimentation). The brand combines calm craftsmanship with practical tinkering.

## 2) Brand story

SumiLabu started as a personal workshop for devices and software that should be useful every day, not just demos.
The "sumi" side represents clarity, intention, and aesthetics.
The "labu" side represents play, iteration, and shipping small improvements continuously.

Positioning statement:
SumiLabu builds small, reliable systems that make everyday life better, one experiment at a time.

## 3) Voice and tone

- Core tone: calm, curious, practical
- Product tone: clear and direct, never noisy
- Community tone: playful and welcoming
- Writing style:
  - Prefer short sentences
  - Explain decisions, not hype
  - Show real constraints and trade-offs

Do:
- sound hands-on and honest
- highlight incremental progress
- celebrate robustness and craft

Avoid:
- overpromising
- enterprise buzzword-heavy language
- ironic or detached voice

## 4) Mascot directions

Primary mascot recommendation:
- Name: Sumi
- Form: ink fox (kitsune silhouette made from a brush stroke)
- Role: guide for experiments, status, and release notes

Alternative mascots:
1. Ink Crane
- Minimal, elegant, calm
- Great for premium visual direction

2. Kintsugi Tanuki
- Maker/repair personality
- Good for debugging and reliability storytelling

3. Brush Cat
- Friendly and approachable
- Good for docs, onboarding, and tutorials

Mascot usage ideas:
- status badges (online, stale, warning, offline)
- small stickers in docs and changelogs
- release codenames by mascot mood (Calm, Spark, Forge)

## 5) Naming architecture

Parent umbrella:
- SumiLabu

Platform services:
- app.sumilabu.com (dashboard)
- api.sumilabu.com (shared telemetry ingest)
- docs.sumilabu.com (documentation)
- status.sumilabu.com (status page)

Project subdomain pattern:
- {project}.sumilabu.com

Project key pattern:
- lowercase kebab-case
- examples: inkyframe, wanikami, weatherboard, sensorhub

## 6) Domain recommendations

Primary:
- sumilabu.com

Defensive and utility:
- sumilabu.ca
- app.sumilabu.com
- api.sumilabu.com
- docs.sumilabu.com
- status.sumilabu.com

Optional brand protection:
- sumilabs.com (common typo/variant)

## 7) Sub-project naming recommendations

### InkyFrame project

Public name options:
1. SumiLabu InkyFrame
2. SumiLabu Timeboard
3. SumiLabu Clockframe

Recommended canonical setup:
- Public name: SumiLabu InkyFrame
- Project key: inkyframe
- Web subdomain: inkyframe.sumilabu.com
- Device ID style: inkyframe-{location}-{nn}

### Wanikami / Waniranks project

Public name options:
1. SumiLabu Wanikami
2. SumiLabu Waniranks
3. SumiLabu KanjiRank

Recommended canonical setup:
- Public name: SumiLabu Wanikami
- Internal slug compatibility: waniranks
- Project key: wanikami
- Legacy alias key (optional): waniranks
- Web subdomain: wanikami.sumilabu.com

## 8) API and telemetry brand labels

Use these in product UI and docs:
- Product label: SumiLabu Fleet
- API label: SumiLabu Telemetry API
- DB label: Sumi Core

Suggested environment naming:
- DEFAULT_PROJECT_KEY=inkyframe
- PROJECT_TOKENS_JSON={"inkyframe":"...","wanikami":"..."}

## 9) Visual direction (quick starter)

- Primary color: sumi black #141414
- Secondary ink gray: #2D2D2D
- Accent paper: #F4F1EA
- Accent stamp red: #B33A3A
- Optional tech accent: #2F6B5F

Typography direction:
- Heading: a characterful serif or humanist sans
- Body: a highly readable sans
- Monospace: reserved for IDs, metrics, and code labels

## 10) Rollout plan

Phase 1 (done in this repo):
- rename dashboard package/folder to sumilabu-dashboard
- update dashboard title and docs to SumiLabu
- keep project partition keys explicit (inkyframe first)

Phase 2:
- provision app.sumilabu.com and api.sumilabu.com
- add wanikami project key and token map
- add project switcher presets in dashboard UI

Phase 3:
- mascot pack and style guide assets
- visual refresh for dashboard shell
- cross-project homepage and docs portal
