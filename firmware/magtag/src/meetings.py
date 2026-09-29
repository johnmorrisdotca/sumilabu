"""Upcoming meetings from the Sumilabu calendar route.

One GET returns the next few meetings as small JSON, so the board never
parses a calendar itself:

    {"ok": true, "meetings": [{"title": "Standup", "start": 1727610600, "end": 1727612400}, ...]}

`start` and `end` are UTC epoch seconds. The board reads this at most once
per MEETINGS_INTERVAL_SECONDS (never under 15 minutes, since every read is a
server call) and does the five-minute warning itself from the times it
already has, so the warning does not depend on a poll landing at the right
moment.
"""

import time

MIN_INTERVAL_SECONDS = 15 * 60
# Repeated presses of the meetings button re-read at most this often.
BUTTON_REFETCH_SECONDS = 60


class Meetings:
    def __init__(self, session, url, token, interval_seconds):
        self.session = session
        self.url = url
        self.token = token
        self.interval = max(int(interval_seconds), MIN_INTERVAL_SECONDS)
        self.items = []
        self.fetched_at = None
        self.error = None
        self.warned = set()

    @property
    def configured(self):
        return bool(self.url)

    def due(self, now):
        return self.configured and (self.fetched_at is None or now - self.fetched_at >= self.interval)

    def fetch(self, now, by_button=False):
        """Read the route. Returns True when the list changed."""
        if not self.configured:
            return False
        if by_button and self.fetched_at is not None and now - self.fetched_at < BUTTON_REFETCH_SECONDS:
            return False
        self.fetched_at = now
        try:
            headers = {"Authorization": "Bearer " + self.token} if self.token else {}
            with self.session.get(self.url, headers=headers, timeout=20) as response:
                body = response.json()
            items = []
            for m in body.get("meetings", []):
                items.append((int(m["start"]), int(m.get("end", m["start"])), str(m.get("title", ""))))
            items.sort()
            changed = items != self.items
            self.items = items
            self.error = None
            return changed
        except Exception as e:  # network, JSON, or route error: keep what we had
            self.error = repr(e)
            return False

    def upcoming(self, now, count=4):
        return [m for m in self.items if m[1] >= now][:count]

    def next_meeting(self, now):
        for m in self.items:
            if m[0] >= now:
                return m
        return None

    def to_warn(self, now, warn_seconds):
        """The meeting starting within warn_seconds that has not been warned about yet."""
        for m in self.items:
            start = m[0]
            if 0 < start - now <= warn_seconds and start not in self.warned:
                self.warned.add(start)
                return m
        return None
