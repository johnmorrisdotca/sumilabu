"""MagTag: two city clocks, meetings, and a five-minute warning.

Buttons, left to right:
  A  Vancouver clock       B  Tokyo clock
  C  meetings (re-reads, at most once a minute)
  D  next LED colour palette

The clock face redraws when the minute changes. Five minutes before a
meeting starts, the coin sound plays, the LEDs flash, and the meetings face
shows for a minute before the clock returns. Vancouver is UTC-7 all year
since British Columbia dropped clock changes in March 2026. Everything is configured in
settings.toml (see settings.toml.example).
"""

import os
import time

import keypad
import board
import rtc
import wifi

import leds
import sounds
from clock import City
from meetings import Meetings
import screen

# --- settings ----------------------------------------------------------------

def setting(name, default):
    value = os.getenv(name)
    return default if value is None or value == "" else value


LOCAL = City(
    setting("LOCAL_CITY_NAME", "Vancouver"),
    int(setting("LOCAL_UTC_OFFSET", -7)),
    setting("LOCAL_TZ_LABELS", "PST"),
    setting("LOCAL_DST_RULE", "none"),
)
REMOTE = City(
    setting("REMOTE_CITY_NAME", "Tokyo"),
    int(setting("REMOTE_UTC_OFFSET", 9)),
    setting("REMOTE_TZ_LABELS", "JST"),
    setting("REMOTE_DST_RULE", "none"),
)
DEVICE_ID = setting("DEVICE_ID", "magtag")
MEETING_WARN_SECONDS = int(setting("MEETING_WARN_SECONDS", 300))
NTP_RESYNC_SECONDS = 6 * 3600
MEETINGS_FACE_SECONDS = 60

# --- hardware ----------------------------------------------------------------

leds.set_brightness(int(setting("LED_BRIGHTNESS_PERCENT", 8)) / 100)
palette_index = int(setting("LED_PALETTE", 0))
leds.show_palette(palette_index)

buttons = keypad.Keys(
    (board.BUTTON_A, board.BUTTON_B, board.BUTTON_C, board.BUTTON_D),
    value_when_pressed=False,
    pull=True,
)
A, B, C, D = 0, 1, 2, 3

# --- network -----------------------------------------------------------------

session = None
ntp = None


def connect():
    """Join Wi-Fi and set the RTC from NTP. Returns True when the clock is set."""
    global session, ntp
    ssid = os.getenv("CIRCUITPY_WIFI_SSID")
    if not ssid:
        return False
    try:
        if not wifi.radio.connected:
            wifi.radio.connect(ssid, os.getenv("CIRCUITPY_WIFI_PASSWORD", ""))
        import adafruit_connection_manager
        import adafruit_ntp
        import adafruit_requests

        pool = adafruit_connection_manager.get_radio_socketpool(wifi.radio)
        if session is None:
            session = adafruit_requests.Session(pool, adafruit_connection_manager.get_radio_ssl_context(wifi.radio))
        if ntp is None:
            ntp = adafruit_ntp.NTP(pool, tz_offset=0, cache_seconds=3600)
        rtc.RTC().datetime = ntp.datetime
        return True
    except Exception as e:
        print("connect:", repr(e))
        return False


clock_ok = connect()
meetings = Meetings(
    session,
    setting("MEETINGS_URL", ""),
    setting("MEETINGS_TOKEN", ""),
    int(setting("MEETINGS_INTERVAL_SECONDS", 900)),
)

# --- faces -------------------------------------------------------------------

city = LOCAL
face = "clock"          # or "meetings"
face_until = None       # when the meetings face gives way to the clock
shown_minute = None
last_sync = time.monotonic()


def draw_clock(now):
    global shown_minute
    footer = "" if clock_ok else "no time sync"
    t0 = time.monotonic()
    screen.show(screen.clock_face(city, now, meetings.next_meeting(now), city.offset_hours(now), footer))
    shown_minute = now // 60
    print("clock", city.name, "drawn in %.2fs" % (time.monotonic() - t0))


def draw_meetings(now):
    screen.show(screen.meetings_face(city, now, meetings.upcoming(now), meetings.error, meetings.configured))


def show_meetings(now):
    global face, face_until
    face, face_until = "meetings", time.monotonic() + MEETINGS_FACE_SECONDS
    draw_meetings(now)


def show_clock(now):
    global face, face_until
    face, face_until = "clock", None
    draw_clock(now)


now = time.time()
if meetings.due(now):
    meetings.fetch(now)
show_clock(now)
print(DEVICE_ID, "ready; clock synced:", clock_ok)

# --- loop --------------------------------------------------------------------

while True:
    now = time.time()
    event = buttons.events.get()
    if event and event.pressed:
        if event.key_number == A:
            sounds.tone(880)
            city = LOCAL
            show_clock(now)
        elif event.key_number == B:
            sounds.tone(988)
            city = REMOTE
            show_clock(now)
        elif event.key_number == C:
            sounds.tone(1047)
            meetings.fetch(now, by_button=True)
            show_meetings(now)
        elif event.key_number == D:
            sounds.tone(784)
            palette_index += 1
            print("palette:", leds.show_palette(palette_index))
        continue

    warn = meetings.to_warn(now, MEETING_WARN_SECONDS)
    if warn is not None:
        print("meeting soon:", warn[2])
        sounds.coin()
        leds.flash((255, 255, 255))
        show_meetings(now)

    if face == "meetings" and face_until is not None and time.monotonic() >= face_until:
        show_clock(now)
    elif face == "clock" and now // 60 != shown_minute:
        draw_clock(now)

    if meetings.due(now):
        if meetings.fetch(now) and face == "clock":
            draw_clock(now)

    if time.monotonic() - last_sync >= NTP_RESYNC_SECONDS or not clock_ok:
        if time.monotonic() - last_sync >= (NTP_RESYNC_SECONDS if clock_ok else 300):
            clock_ok = connect()
            last_sync = time.monotonic()

    time.sleep(0.05)
