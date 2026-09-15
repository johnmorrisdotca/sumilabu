import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_REFRESH_MS,
  IDLE_STOP_MS,
  MINUTE_MS,
  REFRESH_OPTIONS_MS,
  createRefreshScheduler,
  safeRefreshMs,
  type RefreshState,
} from "./auto-refresh";

/*
 * Renders per open tab, counted with fake timers. Each render is a full
 * server render of the dashboard, so these counts are the dashboard's share
 * of the account's Active CPU for one tab.
 */

const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function tab({ intervalMs = DEFAULT_REFRESH_MS, visible = true } = {}) {
  const page = { visible, renders: 0, state: null as RefreshState | null };
  const scheduler = createRefreshScheduler({
    intervalMs,
    refresh: () => {
      page.renders += 1;
    },
    now: () => Date.now(),
    isVisible: () => page.visible,
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    onState: (state) => {
      page.state = state;
    },
  });
  scheduler.start();
  return { page, scheduler };
}

/** Somebody clicks every `everyMs` for `forMs`. */
function keepActive(wake: () => void, forMs: number, everyMs: number) {
  for (let elapsed = 0; elapsed < forMs; elapsed += everyMs) {
    vi.advanceTimersByTime(everyMs);
    wake();
  }
}

/** The control this replaced: setInterval(60 s), skipping hidden tabs, never stopping. */
function legacyTab(intervalMs = 60_000) {
  const page = { visible: true, renders: 0 };
  setInterval(() => {
    if (page.visible) page.renders += 1;
  }, intervalMs);
  return page;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the choices", () => {
  it("offers nothing between Off and five minutes, and defaults to five", () => {
    expect(DEFAULT_REFRESH_MS).toBe(5 * MINUTE_MS);
    expect(REFRESH_OPTIONS_MS.filter((ms) => ms !== 0).every((ms) => ms >= 5 * MINUTE_MS)).toBe(true);
    expect(REFRESH_OPTIONS_MS).toContain(0);
  });

  it("refuses the old 30 s and 60 s defaults rather than honouring them", () => {
    expect(safeRefreshMs(30_000)).toBe(DEFAULT_REFRESH_MS);
    expect(safeRefreshMs(60_000)).toBe(DEFAULT_REFRESH_MS);
    expect(safeRefreshMs(15 * MINUTE_MS)).toBe(15 * MINUTE_MS);
    expect(safeRefreshMs(0)).toBe(0);
  });
});

describe("renders per tab", () => {
  it("before: one visible tab rendered 60 times an hour and 1,440 a day, watched or not", () => {
    const page = legacyTab();
    vi.advanceTimersByTime(HOUR_MS);
    expect(page.renders).toBe(60);
    vi.advanceTimersByTime(DAY_MS - HOUR_MS);
    expect(page.renders).toBe(1440);
  });

  it("after: a tab somebody is using renders 12 times an hour", () => {
    const { page, scheduler } = tab();
    keepActive(scheduler.wake, HOUR_MS, 2 * MINUTE_MS);
    expect(page.renders).toBe(12);
    expect(page.state).toBe("running");
  });

  it("after: clicking constantly adds no renders", () => {
    const { page, scheduler } = tab();
    keepActive(scheduler.wake, HOUR_MS, 1_000);
    expect(page.renders).toBe(12);
  });

  it("after: a visible tab nobody touches renders twice, then stops for the rest of the day", () => {
    const { page } = tab();
    vi.advanceTimersByTime(IDLE_STOP_MS);
    expect(page.renders).toBe(2);
    vi.advanceTimersByTime(DAY_MS);
    expect(page.renders).toBe(2);
    expect(page.state).toBe("idle");
  });

  it("after: a hidden tab renders nothing", () => {
    const { page } = tab({ visible: false });
    vi.advanceTimersByTime(DAY_MS);
    expect(page.renders).toBe(0);
    expect(page.state).toBe("hidden");
  });

  it("after: Off renders nothing, whatever anybody does", () => {
    const { page, scheduler } = tab({ intervalMs: 0 });
    keepActive(scheduler.wake, HOUR_MS, MINUTE_MS);
    expect(page.renders).toBe(0);
    expect(page.state).toBe("off");
  });

  it("after: at thirty minutes, a tab in use renders twice an hour", () => {
    const { page, scheduler } = tab({ intervalMs: 30 * MINUTE_MS });
    keepActive(scheduler.wake, HOUR_MS, 2 * MINUTE_MS);
    expect(page.renders).toBe(2);
  });
});

describe("coming back", () => {
  it("renders once on return to a stale idle tab, then resumes the cadence", () => {
    const { page, scheduler } = tab();
    vi.advanceTimersByTime(3 * HOUR_MS);
    expect(page.renders).toBe(2);

    scheduler.wake();
    expect(page.renders).toBe(3);
    expect(page.state).toBe("running");

    vi.advanceTimersByTime(5 * MINUTE_MS);
    expect(page.renders).toBe(4);
  });

  it("does not render on return when the page is still fresh", () => {
    const { page, scheduler } = tab();
    page.visible = false;
    scheduler.visibilityChanged();
    vi.advanceTimersByTime(MINUTE_MS);
    page.visible = true;
    scheduler.visibilityChanged();
    expect(page.renders).toBe(0);
    vi.advanceTimersByTime(4 * MINUTE_MS);
    expect(page.renders).toBe(1);
  });

  it("stops the timer while hidden, and catches up once when shown again", () => {
    const { page, scheduler } = tab();
    page.visible = false;
    scheduler.visibilityChanged();
    vi.advanceTimersByTime(2 * HOUR_MS);
    expect(page.renders).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    page.visible = true;
    scheduler.visibilityChanged();
    expect(page.renders).toBe(1);
  });

  it("costs one render for the click that presses Refresh now on an idle tab", () => {
    const { page, scheduler } = tab();
    vi.advanceTimersByTime(HOUR_MS);
    expect(page.renders).toBe(2);

    scheduler.wake();
    scheduler.refreshByHand();
    expect(page.renders).toBe(3);
  });
});
