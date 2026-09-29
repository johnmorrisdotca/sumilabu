/**
 * The next meetings from an iCalendar feed, for a device that has neither the
 * memory nor the battery to read the feed itself.
 *
 * Reads the subset a work calendar's published `.ics` actually uses: timed
 * VEVENTs (all-day ones are not meetings), `TZID` and UTC times, and the
 * recurrence rules meetings are made of - daily and weekly, with `INTERVAL`,
 * `BYDAY`, `COUNT`, `UNTIL`, `EXDATE`, and a `RECURRENCE-ID` override for a
 * single moved or renamed instance. Monthly and yearly rules are expanded
 * only for their first instance; a standup is never monthly.
 *
 * Times go out as UTC epoch seconds. The device applies its own zone.
 */

export type Meeting = { title: string; start: number; end: number };

type Event = {
  uid: string;
  title: string;
  start: number;
  end: number;
  tzid: string | null;
  allDay: boolean;
  cancelled: boolean;
  rrule: Record<string, string> | null;
  exdates: Set<number>;
  recurrenceId: number | null;
};

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Unfold RFC 5545 continuation lines and split into `NAME;PARAMS:VALUE`. */
function lines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter((l) => l.length > 0);
}

function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

/** Wall-clock components in `tz` -> UTC epoch seconds, via Intl (no tz database of our own). */
function zonedToEpoch(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string | null): number {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s) / 1000;
  if (!tz) return asUtc;
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
  } catch {
    return asUtc; // unknown zone name: treat as UTC rather than drop the meeting
  }
  // Offset of tz at the guessed instant; one correction handles DST edges.
  const offsetAt = (epoch: number) => {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(epoch * 1000)).map((p) => [p.type, p.value]));
    const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) / 1000;
    return local - epoch;
  };
  let guess = asUtc - offsetAt(asUtc);
  guess = asUtc - offsetAt(guess);
  return guess;
}

function parseDateTime(value: string, params: Record<string, string>): { epoch: number; allDay: boolean; tzid: string | null } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { epoch: Date.UTC(+y, +mo - 1, +d) / 1000, allDay: true, tzid: null };
  const tzid = z ? null : params.TZID ?? null;
  return { epoch: zonedToEpoch(+y, +mo, +d, +h, +mi, +s, z ? null : tzid), allDay: false, tzid };
}

function parseEvents(text: string): Event[] {
  const events: Event[] = [];
  let cur: Partial<Event> | null = null;
  for (const raw of lines(text)) {
    if (raw === "BEGIN:VEVENT") {
      cur = { title: "", tzid: null, allDay: false, cancelled: false, rrule: null, exdates: new Set(), recurrenceId: null };
      continue;
    }
    if (raw === "END:VEVENT") {
      if (cur && cur.uid && cur.start !== undefined) {
        if (cur.end === undefined) cur.end = cur.start;
        events.push(cur as Event);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseLine(raw);
    if (!p) continue;
    switch (p.name) {
      case "UID":
        cur.uid = p.value;
        break;
      case "SUMMARY":
        cur.title = p.value.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ").replace(/\\\\/g, "\\").trim();
        break;
      case "STATUS":
        cur.cancelled = p.value.toUpperCase() === "CANCELLED";
        break;
      case "DTSTART": {
        const dt = parseDateTime(p.value, p.params);
        if (dt) {
          cur.start = dt.epoch;
          cur.allDay = dt.allDay;
          cur.tzid = dt.tzid;
        }
        break;
      }
      case "DTEND": {
        const dt = parseDateTime(p.value, p.params);
        if (dt) cur.end = dt.epoch;
        break;
      }
      case "DURATION": {
        const d = p.value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
        if (d && cur.start !== undefined) cur.end = cur.start + (+(d[1] ?? 0)) * 86400 + (+(d[2] ?? 0)) * 3600 + (+(d[3] ?? 0)) * 60 + +(d[4] ?? 0);
        break;
      }
      case "RRULE":
        cur.rrule = Object.fromEntries(p.value.split(";").map((kv) => kv.split("=") as [string, string]).map(([k, v]) => [k.toUpperCase(), v]));
        break;
      case "EXDATE":
        for (const v of p.value.split(",")) {
          const dt = parseDateTime(v, p.params);
          if (dt) cur.exdates!.add(dt.epoch);
        }
        break;
      case "RECURRENCE-ID": {
        const dt = parseDateTime(p.value, p.params);
        if (dt) cur.recurrenceId = dt.epoch;
        break;
      }
    }
  }
  return events;
}

/** The wall-clock date of `epoch` in `tz`, so a weekly rule counts days the way the calendar does. */
function localParts(epoch: number, tz: string | null): { y: number; mo: number; d: number; h: number; mi: number; s: number; wd: number } {
  if (!tz) {
    const dt = new Date(epoch * 1000);
    return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: dt.getUTCHours(), mi: dt.getUTCMinutes(), s: dt.getUTCSeconds(), wd: dt.getUTCDay() };
  }
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" });
  } catch {
    return localParts(epoch, null);
  }
  const p = Object.fromEntries(fmt.formatToParts(new Date(epoch * 1000)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}

/** Instances of one event's rule inside [from, to). The event's own start is the first. */
function occurrences(ev: Event, from: number, to: number): number[] {
  const out: number[] = [];
  const rule = ev.rrule;
  if (!rule) {
    if (ev.end > from && ev.start < to) out.push(ev.start);
    return out;
  }
  const freq = rule.FREQ;
  const interval = Math.max(1, parseInt(rule.INTERVAL ?? "1", 10) || 1);
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : Infinity;
  const untilParsed = rule.UNTIL ? parseDateTime(rule.UNTIL, {}) : null;
  const until = untilParsed ? (untilParsed.allDay ? untilParsed.epoch + 86399 : untilParsed.epoch) : Infinity;
  const duration = ev.end - ev.start;
  const byday = rule.BYDAY ? rule.BYDAY.split(",").map((d) => WEEKDAYS.indexOf(d.slice(-2))).filter((i) => i >= 0) : null;
  const base = localParts(ev.start, ev.tzid);
  const startWd = base.wd;

  // Walk day by day in the event's own zone; cheap for the week or two asked for.
  let n = 0;
  const limitDays = 366 * 3;
  for (let day = 0; day < limitDays && n < count; day++) {
    // Nth calendar day after the first instance, at the same wall-clock time.
    const y = base.y, mo = base.mo, d = base.d + day;
    const candidate = zonedToEpoch(y, mo, d, base.h, base.mi, base.s, ev.tzid);
    if (candidate > until) break;
    let matches: boolean;
    if (freq === "DAILY") {
      matches = day % interval === 0;
    } else if (freq === "WEEKLY") {
      const week = Math.floor((day + startWd) / 7);
      const wd = (startWd + day) % 7;
      const dayOk = byday ? byday.includes(wd) : day % 7 === 0;
      matches = dayOk && week % interval === 0;
    } else {
      matches = day === 0; // MONTHLY/YEARLY: first instance only
      if (day > 0) break;
    }
    if (!matches) continue;
    n++;
    if (ev.exdates.has(candidate)) continue;
    if (candidate >= to) break;
    if (candidate + duration > from) out.push(candidate);
  }
  return out;
}

/**
 * The meetings starting or running in [from, to), soonest first, at most
 * `limit`. A recurring series' overrides (RECURRENCE-ID) replace the instance
 * they name, cancellations remove it.
 */
export function upcomingMeetings(ics: string, from: number, to: number, limit = 4): Meeting[] {
  const events = parseEvents(ics).filter((e) => !e.allDay);
  const overrides = new Map<string, Event>();
  for (const e of events) if (e.recurrenceId !== null) overrides.set(`${e.uid}@${e.recurrenceId}`, e);

  const out: Meeting[] = [];
  for (const e of events) {
    if (e.recurrenceId !== null) continue;
    for (const start of occurrences(e, from, to)) {
      const o = overrides.get(`${e.uid}@${start}`);
      const inst = o ?? e;
      if (inst.cancelled) continue;
      const s = o ? o.start : start;
      const en = o ? o.end : start + (e.end - e.start);
      if (en > from && s < to) out.push({ title: inst.title, start: s, end: en });
    }
  }
  out.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
  return out.slice(0, limit);
}
