/**
 * When the dashboard re-renders itself.
 *
 * Every refresh is `router.refresh()` on a `force-dynamic` page: a full server
 * render with its database reads, billed against the Vercel account's Active
 * CPU, which every project shares. So the cadence follows the account's rule
 * for anything on a timer:
 *
 * - nothing faster than five minutes;
 * - nothing while the tab is hidden;
 * - no timed refresh once nobody has touched the page for `IDLE_STOP_MS`, so a
 *   tab left open overnight costs two renders rather than a night's worth;
 * - coming back (focus, a click, a key, a scroll, the tab shown again) renders
 *   once if what is on screen is older than the interval, then resumes.
 *
 * Pure and clock-injected, so the counts are tested with fake timers rather
 * than by leaving a browser open against the live site.
 */

export const MINUTE_MS = 60_000;

/** 0 is Off. Nothing between Off and five minutes, on purpose. */
export const REFRESH_OPTIONS_MS = [0, 5 * MINUTE_MS, 10 * MINUTE_MS, 15 * MINUTE_MS, 30 * MINUTE_MS] as const;

export const DEFAULT_REFRESH_MS = 5 * MINUTE_MS;

/** A timed refresh only happens while somebody has touched the page within this long. */
export const IDLE_STOP_MS = 10 * MINUTE_MS;

/**
 * A render started this recently is the render a manual refresh asked for:
 * the click that presses "Refresh now" also wakes a paused scheduler, and one
 * press should cost one render.
 */
export const SAME_RENDER_MS = 1_000;

export type RefreshState = "off" | "running" | "hidden" | "idle";

export type RefreshSchedulerDeps = {
  intervalMs: number;
  idleMs?: number;
  refresh: () => void;
  now: () => number;
  isVisible: () => boolean;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  onState?: (state: RefreshState) => void;
};

export type RefreshScheduler = {
  /** Begin the cadence; the page on screen counts as rendered now. */
  start: () => void;
  /** Somebody did something: focus, click, key, scroll, or the tab was shown. */
  wake: () => void;
  /** The tab's visibility changed. */
  visibilityChanged: () => void;
  /** "Refresh now". */
  refreshByHand: () => void;
  stop: () => void;
};

export function isRefreshOption(ms: unknown): ms is (typeof REFRESH_OPTIONS_MS)[number] {
  return (REFRESH_OPTIONS_MS as readonly unknown[]).includes(ms);
}

export function safeRefreshMs(ms: unknown): number {
  return isRefreshOption(ms) ? ms : DEFAULT_REFRESH_MS;
}

export function refreshLabel(ms: number): string {
  return ms <= 0 ? "Off" : `${ms / MINUTE_MS}m`;
}

export function createRefreshScheduler(deps: RefreshSchedulerDeps): RefreshScheduler {
  const idleMs = deps.idleMs ?? IDLE_STOP_MS;
  let renderedAt = deps.now();
  let activeAt = renderedAt;
  let timer: unknown = null;
  let state: RefreshState | null = null;

  function show(next: RefreshState) {
    if (next === state) return;
    state = next;
    deps.onState?.(next);
  }

  function clear() {
    if (timer === null) return;
    deps.clearTimer(timer);
    timer = null;
  }

  function render() {
    renderedAt = deps.now();
    deps.refresh();
  }

  function schedule() {
    clear();
    if (deps.intervalMs <= 0) return show("off");
    if (!deps.isVisible()) return show("hidden");
    const dueAt = renderedAt + deps.intervalMs;
    /* Judged against when the render is due, not when the timer happens to
       fire, so a late timer cannot turn the last allowed render into none. */
    if (dueAt > activeAt + idleMs) return show("idle");
    show("running");
    timer = deps.setTimer(tick, Math.max(0, dueAt - deps.now()));
  }

  function tick() {
    timer = null;
    if (deps.intervalMs <= 0 || !deps.isVisible()) return schedule();
    if (renderedAt + deps.intervalMs > activeAt + idleMs) return show("idle");
    render();
    schedule();
  }

  function wake() {
    activeAt = deps.now();
    if (timer !== null || deps.intervalMs <= 0 || !deps.isVisible()) {
      if (timer === null) schedule();
      return;
    }
    if (deps.now() - renderedAt >= deps.intervalMs) render();
    schedule();
  }

  return {
    start: schedule,
    wake,
    visibilityChanged() {
      if (deps.isVisible()) wake();
      else schedule();
    },
    refreshByHand() {
      activeAt = deps.now();
      if (deps.now() - renderedAt >= SAME_RENDER_MS) render();
      schedule();
    },
    stop() {
      clear();
    },
  };
}
