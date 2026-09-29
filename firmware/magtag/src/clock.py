"""Wall-clock time for two cities, from the board's RTC set by NTP.

The RTC holds UTC. Each city is a fixed offset, plus the US daylight rule
for a city that still changes its clocks. Neither of ours does: Tokyo never
did, and British Columbia went to permanent UTC-7 on 2026-03-09 (tz database
2026b), so Vancouver is "none" too. The rule stays for a Seattle or a
New York.
"""

import time

WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _nth_sunday_utc(year, month, n, hour_utc):
    """UTC epoch of the n-th Sunday of a month at hour_utc."""
    first = time.mktime((year, month, 1, hour_utc, 0, 0, 0, 0, -1))
    wday = time.localtime(first)[6]  # Monday is 0
    days_to_sunday = (6 - wday) % 7
    return first + (days_to_sunday + 7 * (n - 1)) * 86400


def us_dst_active(utc_epoch, standard_offset_hours):
    """US rule: second Sunday of March 02:00 local to first Sunday of November 02:00 local."""
    year = time.localtime(utc_epoch)[0]
    # 02:00 standard time is (2 - offset) hours UTC; the end is 02:00 daylight time.
    start = _nth_sunday_utc(year, 3, 2, 2 - standard_offset_hours)
    end = _nth_sunday_utc(year, 11, 1, 2 - (standard_offset_hours + 1))
    return start <= utc_epoch < end


class City:
    def __init__(self, name, standard_offset_hours, labels, dst_rule="none"):
        self.name = name
        self.standard_offset = standard_offset_hours
        self.dst_rule = dst_rule
        # "PST/PDT" or just "JST"
        parts = labels.split("/")
        self.standard_label = parts[0]
        self.daylight_label = parts[1] if len(parts) > 1 else parts[0]

    def offset_hours(self, utc_epoch):
        if self.dst_rule == "us" and us_dst_active(utc_epoch, self.standard_offset):
            return self.standard_offset + 1
        return self.standard_offset

    def label(self, utc_epoch):
        if self.offset_hours(utc_epoch) != self.standard_offset:
            return self.daylight_label
        return self.standard_label

    def now(self, utc_epoch):
        """time.struct_time in this city."""
        return time.localtime(utc_epoch + self.offset_hours(utc_epoch) * 3600)


def hhmm(t):
    return "{:02d}:{:02d}".format(t[3], t[4])


def date_line(t):
    return "{} {} {}, {}".format(WEEKDAYS[t[6]], MONTHS[t[1] - 1], t[2], t[0])
