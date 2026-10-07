/*
 * Telemetry events the hub acknowledges and does not store.
 *
 * Every stored event is a Postgres write, and a write wakes Neon for the five
 * minutes it waits before sleeping again. On 2026-10-07 the production table
 * held 215,000 events (498 MB, the whole of the project's storage allowance on
 * Neon's Free plan), and the three UmaKuma names below were its only senders
 * still talking: one row for every API call the site served, none of them read
 * by anyone. John, same day: Sumilabu "can be trimmed immensely and not as
 * active".
 *
 * An entry is `event` (any project) or `projectKey:event`. The sender gets the
 * ordinary `{ ok: true }` back, so nothing needs changing over there for this
 * to work; `dropped: true` says it was not kept. `TELEMETRY_DROP_EVENTS`
 * replaces the list (comma separated; `none` keeps everything), so a name can
 * be let back in from Vercel's environment without a deploy of code.
 */
export const DEFAULT_DROPPED_EVENTS = [
  "umakuma:api_route",
  "umakuma:study_review_history",
  "umakuma:reading_signoffs_get_perf",
] as const;

export function droppedEvents(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.TELEMETRY_DROP_EVENTS?.trim();
  if (raw === undefined || raw === "") return [...DEFAULT_DROPPED_EVENTS];
  if (raw.toLowerCase() === "none") return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

export function isDroppedEvent(projectKey: string, event: string, env: Record<string, string | undefined> = process.env): boolean {
  const list = droppedEvents(env);
  return list.includes(event) || list.includes(`${projectKey}:${event}`);
}
