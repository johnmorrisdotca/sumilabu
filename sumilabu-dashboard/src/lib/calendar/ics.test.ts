import { describe, expect, it } from "vitest";

import { upcomingMeetings } from "./ics";

/* A feed the way Google Calendar publishes one: TZID times, a weekly rule
   with BYDAY, an exception, a moved instance, a cancelled one, an all-day
   event, and a folded SUMMARY line. */
const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:standup@example",
  "SUMMARY:Standup",
  "DTSTART;TZID=America/Vancouver:20260928T093000",
  "DTEND;TZID=America/Vancouver:20260928T094500",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
  "EXDATE;TZID=America/Vancouver:20261002T093000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:standup@example",
  "RECURRENCE-ID;TZID=America/Vancouver:20260930T093000",
  "SUMMARY:Standup (moved)",
  "DTSTART;TZID=America/Vancouver:20260930T110000",
  "DTEND;TZID=America/Vancouver:20260930T111500",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:review@example",
  "SUMMARY:Design review\\, with a very long",
  "  name that was folded",
  "DTSTART:20260929T200000Z",
  "DURATION:PT1H",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:gone@example",
  "SUMMARY:Cancelled thing",
  "STATUS:CANCELLED",
  "DTSTART:20260929T210000Z",
  "DTEND:20260929T213000Z",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:holiday@example",
  "SUMMARY:Company holiday",
  "DTSTART;VALUE=DATE:20260930",
  "DTEND;VALUE=DATE:20261001",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:daily@example",
  "SUMMARY:Focus block",
  "DTSTART:20260929T140000Z",
  "DTEND:20260929T150000Z",
  "RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const T = (iso: string) => Date.parse(iso) / 1000;

describe("upcomingMeetings", () => {
  it("expands a weekly BYDAY rule in the calendar's zone, applying the exception and the moved instance", () => {
    const from = T("2026-09-29T00:00:00Z");
    const got = upcomingMeetings(FEED, from, from + 7 * 86400, 20).filter((m) => m.title.startsWith("Standup"));
    expect(got.map((m) => [m.title, new Date(m.start * 1000).toISOString()])).toEqual([
      ["Standup (moved)", "2026-09-30T18:00:00.000Z"], // Wednesday, moved to 11:00 PDT
      // Friday 2026-10-02 is the EXDATE
      ["Standup", "2026-10-05T16:30:00.000Z"], // Monday 09:30 PDT
    ]);
  });

  it("keeps timed events, drops all-day and cancelled ones, unfolds and unescapes the title", () => {
    const from = T("2026-09-29T00:00:00Z");
    const titles = upcomingMeetings(FEED, from, from + 2 * 86400, 20).map((m) => m.title);
    expect(titles).toContain("Design review, with a very long name that was folded");
    expect(titles).not.toContain("Cancelled thing");
    expect(titles).not.toContain("Company holiday");
  });

  it("honours DURATION, INTERVAL and COUNT", () => {
    const from = T("2026-09-29T00:00:00Z");
    const focus = upcomingMeetings(FEED, from, from + 30 * 86400, 20).filter((m) => m.title === "Focus block");
    expect(focus.map((m) => new Date(m.start * 1000).toISOString().slice(0, 10))).toEqual(["2026-09-29", "2026-10-01", "2026-10-03"]);
    const review = upcomingMeetings(FEED, from, from + 86400, 20).find((m) => m.title.startsWith("Design review"))!;
    expect(review.end - review.start).toBe(3600);
  });

  it("includes a meeting already in progress, sorts by start, and caps at limit", () => {
    const from = T("2026-09-29T20:30:00Z"); // review started at 20:00Z
    const got = upcomingMeetings(FEED, from, from + 7 * 86400, 2);
    expect(got).toHaveLength(2);
    expect(got[0].title.startsWith("Design review")).toBe(true);
    expect(got[0].start).toBeLessThan(got[1].start);
  });

  it("crosses a DST change with the wall-clock time kept", () => {
    // Los Angeles still changes its clocks; Vancouver stopped in 2026 (below).
    const feed = FEED.replace(/America\/Vancouver/g, "America/Los_Angeles");
    const from = T("2026-11-02T00:00:00Z"); // DST ended 2026-11-01
    const got = upcomingMeetings(feed, from, from + 3 * 86400, 20).filter((m) => m.title === "Standup");
    expect(new Date(got[0].start * 1000).toISOString()).toBe("2026-11-02T17:30:00.000Z"); // Monday 09:30 PST
  });

  it("follows the tz database, not a rule of its own: British Columbia is permanent UTC-7 since 2026-03-09", () => {
    // tzdata 2026b carries the change, modelled at 2026-11-01. A Node with older
    // data still answers 17:30Z here; the assertion is on the data the runtime has,
    // which is the point - the parser must not hard-code a rule the world dropped.
    const from = T("2026-11-02T00:00:00Z");
    const got = upcomingMeetings(FEED, from, from + 3 * 86400, 20).filter((m) => m.title === "Standup");
    const current = (process.versions.tz ?? "") >= "2026b";
    expect(new Date(got[0].start * 1000).toISOString()).toBe(current ? "2026-11-02T16:30:00.000Z" : "2026-11-02T17:30:00.000Z");
  });

  it("answers empty, not an error, for a feed with nothing coming", () => {
    expect(upcomingMeetings("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", 0, 86400)).toEqual([]);
    expect(upcomingMeetings("not a calendar at all", 0, 86400)).toEqual([]);
  });
});
