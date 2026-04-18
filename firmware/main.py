"""InkyFrame clock firmware for multiple device profiles.

Drop this file onto the Pico W running Pimoroni MicroPython firmware.
"""

import time
import gc
import json

try:
    import secrets
except ImportError:
    secrets = None

gc.collect()

try:
    from custom_bitmaps import (
        FONT_UI_BIG,
        FONT_DATE,
        FONT_TIME,
        FONT_JP,
    )
    CUSTOM_BITMAPS_IMPORT_ERROR = None
except Exception as exc:
    FONT_UI_BIG = None
    FONT_DATE = None
    FONT_TIME = None
    FONT_JP = None
    CUSTOM_BITMAPS_IMPORT_ERROR = "{}: {}".format(type(exc).__name__, exc)

gc.collect()

import ntptime  # type: ignore[import-not-found]
import network  # type: ignore[import-not-found]
import inky_frame  # type: ignore[import-not-found]
import picographics  # type: ignore[import-not-found]
from picographics import PicoGraphics  # type: ignore[import-not-found]

try:
    import usocket as socket  # type: ignore[import-not-found]
except Exception:
    try:
        import socket  # type: ignore[import-not-found]
    except Exception:
        socket = None

try:
    import machine  # type: ignore[import-not-found]
except Exception:
    machine = None

try:
    import ubinascii  # type: ignore[import-not-found]
except Exception:
    ubinascii = None

urequests = None


def get_urequests():
    global urequests
    if urequests is False:
        return None
    if urequests is None:
        gc.collect()
        try:
            import urequests as imported_urequests  # type: ignore[import-not-found]
            urequests = imported_urequests
        except Exception:
            urequests = False
    return urequests or None


def resolve_display_constant():
    requested = getattr(secrets, "INKY_DISPLAY", "auto") if secrets else "auto"

    if requested and requested != "auto":
        # Accept common 5.7 naming variants across firmware builds.
        aliases = [requested]
        if requested == "DISPLAY_INKY_FRAME_5_7":
            aliases.extend(["DISPLAY_INKY_FRAME_5", "DISPLAY_INKY_FRAME"])
        elif requested == "DISPLAY_INKY_FRAME_5":
            aliases.extend(["DISPLAY_INKY_FRAME_5_7", "DISPLAY_INKY_FRAME"])
        elif requested == "DISPLAY_INKY_FRAME":
            aliases.extend(["DISPLAY_INKY_FRAME_5_7", "DISPLAY_INKY_FRAME_5"])
        elif requested == "DISPLAY_INKY_FRAME_7_3":
            aliases.append("DISPLAY_INKY_FRAME_7")
        elif requested == "DISPLAY_INKY_FRAME_7":
            aliases.append("DISPLAY_INKY_FRAME_7_3")

        for alias in aliases:
            display_constant = getattr(picographics, alias, None)
            if display_constant is not None:
                return display_constant, alias

        raise RuntimeError("Requested INKY_DISPLAY not found: {}".format(requested))

    candidates = (
        "DISPLAY_INKY_FRAME_7",
        "DISPLAY_INKY_FRAME_7_3",
        "DISPLAY_INKY_FRAME_5_7",
        "DISPLAY_INKY_FRAME_5",
        "DISPLAY_INKY_FRAME",
    )
    for name in candidates:
        display_constant = getattr(picographics, name, None)
        if display_constant is not None:
            return display_constant, name

    raise RuntimeError("No supported InkyFrame display constant found in picographics")


DISPLAY, DISPLAY_MODEL = resolve_display_constant()

# --- Display Constants (dual-clock layout baseline) ---
TITLE_BOTTOM = 66
JP_LABEL_Y_OFFSET = 6
TIME_Y_BOTTOM = 245
TIME_SCALE_FACTOR = 1.58
DATE_Y_BOTTOM = 296
WEEKDAY_Y_BOTTOM = 336
COL_W_SPACING = 1
TIME_SPACING = 2
DATE_SPACING = 2
TIME_COLON_Y_OFFSET = -24
FOOTER_PAD_X = 20

# Generic locality config (defaults preserve existing Vancouver/Tokyo behavior).
LOCAL_CITY_NAME = getattr(secrets, "LOCAL_CITY_NAME", "VANCOUVER").upper() if secrets else "VANCOUVER"
REMOTE_CITY_NAME = getattr(secrets, "REMOTE_CITY_NAME", "TOKYO").upper() if secrets else "TOKYO"
LOCAL_CITY_NAME_JP = getattr(secrets, "LOCAL_CITY_NAME_JP", "バンクーバー") if secrets else "バンクーバー"
REMOTE_CITY_NAME_JP = getattr(secrets, "REMOTE_CITY_NAME_JP", "東京") if secrets else "東京"

# Generic fixed UTC offsets for local and remote clocks.
LOCAL_UTC_OFFSET = getattr(secrets, "LOCAL_UTC_OFFSET", -7) if secrets else -7
REMOTE_UTC_OFFSET = getattr(secrets, "REMOTE_UTC_OFFSET", 9) if secrets else 9

LOCAL_TZ_LABEL = getattr(secrets, "LOCAL_TZ_LABEL", "LOCAL") if secrets else "LOCAL"
REMOTE_TZ_LABEL = getattr(secrets, "REMOTE_TZ_LABEL", "JST") if secrets else "JST"
DEVICE_PROFILE = (getattr(secrets, "DEVICE_PROFILE", "dual") if secrets else "dual").lower()
JAPAN_ONLY_PROFILE = DEVICE_PROFILE in ("japan", "japan-only", "jp")

PST_OFFSET_HOURS = LOCAL_UTC_OFFSET
JST_OFFSET_HOURS = REMOTE_UTC_OFFSET
REFRESH_SECONDS = 5 * 60
STALE_RESTART_SECONDS = 20 * 60
INVALID_CLOCK_RETRY_SECONDS = 30
STARTUP_NTP_ATTEMPTS = 3
NTP_RETRIES = 3
MIN_VALID_YEAR = 2024
WIFI_CONNECT_TIMEOUT_S = 35
WATCHDOG_MAX_TIMEOUT_MS = getattr(secrets, "WATCHDOG_MAX_TIMEOUT_MS", 8388) if secrets else 8388
WATCHDOG_REQUESTED_TIMEOUT_MS = getattr(secrets, "WATCHDOG_TIMEOUT_MS", WATCHDOG_MAX_TIMEOUT_MS) if secrets else WATCHDOG_MAX_TIMEOUT_MS
WATCHDOG_TIMEOUT_MS = max(1000, min(WATCHDOG_REQUESTED_TIMEOUT_MS, WATCHDOG_MAX_TIMEOUT_MS))
WATCHDOG_CLAMPED = WATCHDOG_TIMEOUT_MS != WATCHDOG_REQUESTED_TIMEOUT_MS
ENABLE_WATCHDOG = bool(getattr(secrets, "ENABLE_WATCHDOG", False)) if secrets else False
APP_VERSION = "2026-04-16-2"
NTP_RESYNC_SECONDS = getattr(secrets, "NTP_RESYNC_SECONDS", 0) if secrets else 0

STATS_API_URL = getattr(secrets, "STATS_API_URL", None) if secrets else None
STATS_API_TOKEN = getattr(secrets, "STATS_API_TOKEN", None) if secrets else None
STATS_DEVICE_ID = getattr(secrets, "STATS_DEVICE_ID", None) if secrets else None
STATS_PROJECT_KEY = getattr(secrets, "STATS_PROJECT_KEY", "inkyframe") if secrets else "inkyframe"
STATS_INTERVAL_SECONDS = getattr(secrets, "STATS_INTERVAL_SECONDS", REFRESH_SECONDS) if secrets else REFRESH_SECONDS
STATS_HTTP_TIMEOUT_S = getattr(secrets, "STATS_HTTP_TIMEOUT_S", 8) if secrets else 8
RENDER_WDT_FEED_ROWS = 8
ENABLE_AUTO_RECOVER_RESET = bool(getattr(secrets, "ENABLE_AUTO_RECOVER_RESET", False)) if secrets else False

ACTIVE_CITY_NAME = getattr(secrets, "ACTIVE_CITY_NAME", REMOTE_CITY_NAME) if secrets else REMOTE_CITY_NAME
ACTIVE_CITY_NAME_JP = getattr(secrets, "ACTIVE_CITY_NAME_JP", REMOTE_CITY_NAME_JP) if secrets else REMOTE_CITY_NAME_JP
ACTIVE_UTC_OFFSET = getattr(secrets, "ACTIVE_UTC_OFFSET", REMOTE_UTC_OFFSET) if secrets else REMOTE_UTC_OFFSET
ACTIVE_TZ_LABEL = getattr(secrets, "ACTIVE_TZ_LABEL", REMOTE_TZ_LABEL) if secrets else REMOTE_TZ_LABEL

# Mutable city state for japan profile (buttons A/B/C switch city).
_jp_city = {
    "name": ACTIVE_CITY_NAME,
    "name_jp": ACTIVE_CITY_NAME_JP,
    "offset": ACTIVE_UTC_OFFSET,
    "tz": ACTIVE_TZ_LABEL,
}

def jp_set_city(name, name_jp, offset, tz):
    _jp_city["name"] = name
    _jp_city["name_jp"] = name_jp
    _jp_city["offset"] = offset
    _jp_city["tz"] = tz

def jp_toggle_city():
    if _jp_city["name"] == LOCAL_CITY_NAME:
        jp_set_city(REMOTE_CITY_NAME, REMOTE_CITY_NAME_JP, REMOTE_UTC_OFFSET, REMOTE_TZ_LABEL)
    else:
        jp_set_city(LOCAL_CITY_NAME, LOCAL_CITY_NAME_JP, LOCAL_UTC_OFFSET, LOCAL_TZ_LABEL)
DISPLAY_UPDATE_SPEED = getattr(secrets, "DISPLAY_UPDATE_SPEED", 0) if secrets else 0

MODE_A = "A"
MODE_B = "B"
MODE_C = "C"
MODE_D = "D"
MODE_E = "E"

SAMPLE_MEETINGS_UTC = [
    # Same meeting list rendered in different local timezones.
    ("Standup", 17, 0),
    ("Planning", 20, 0),
    ("1:1", 0, 30),
]

graphics = PicoGraphics(display=DISPLAY)
try:
    # Favor full-quality e-ink updates for readability and reduced ghosting.
    graphics.set_update_speed(DISPLAY_UPDATE_SPEED)
except Exception:
    pass

WIDTH, HEIGHT = graphics.get_bounds()
WHITE = graphics.create_pen(255, 255, 255)
BLACK = graphics.create_pen(0, 0, 0)
COL_GUTTER = 28
LEFT_X = 20
RIGHT_X = (WIDTH // 2) + COL_GUTTER
COL_W = (WIDTH // 2) - (COL_GUTTER + 20)
FOOTER_RIGHT_X = (WIDTH // 2) + FOOTER_PAD_X
FOOTER_RIGHT_W = (WIDTH // 2) - (FOOTER_PAD_X * 2)

REQUIRED_JP_CHARS = tuple("".join(sorted(set(LOCAL_CITY_NAME_JP + REMOTE_CITY_NAME_JP + "月火水木金土日曜日"))))
REQUIRED_TIME_CHARS = tuple("0123456789:")
REQUIRED_DATE_CHARS = tuple("0123456789/-年月日")
REQUIRED_UI_BIG_CHARS = tuple("".join(sorted(set(LOCAL_CITY_NAME + REMOTE_CITY_NAME))))


def default_device_id():
    if STATS_DEVICE_ID:
        return STATS_DEVICE_ID
    prefix = "inky-jp" if JAPAN_ONLY_PROFILE else "inky-dual"
    if machine and hasattr(machine, "unique_id") and ubinascii:
        try:
            chip_id = ubinascii.hexlify(machine.unique_id()).decode("ascii")
            return "{}-{}-{}".format(prefix, DISPLAY_MODEL.lower().replace("display_", "").replace("_", ""), chip_id[-6:])
        except Exception:
            pass
    return "{}-unknown".format(prefix)


DEVICE_ID = default_device_id()


def init_watchdog():
    if not ENABLE_WATCHDOG:
        return None
    if not machine or not hasattr(machine, "WDT"):
        return None
    try:
        return machine.WDT(timeout=WATCHDOG_TIMEOUT_MS)
    except Exception:
        # RP2040 watchdog init can fail on some builds if timeout constraints are strict.
        for fallback_ms in (8000, 5000, 3000):
            try:
                return machine.WDT(timeout=fallback_ms)
            except Exception:
                pass
        return None


WATCHDOG = init_watchdog()


def mono_ms():
    try:
        return time.ticks_ms()
    except Exception:
        return int(time.time() * 1000)


def mono_add(base_ms, delta_ms):
    try:
        return time.ticks_add(base_ms, delta_ms)
    except Exception:
        return base_ms + delta_ms


def mono_diff(newer_ms, older_ms):
    try:
        return time.ticks_diff(newer_ms, older_ms)
    except Exception:
        return newer_ms - older_ms


def feed_watchdog():
    if WATCHDOG and hasattr(WATCHDOG, "feed"):
        try:
            WATCHDOG.feed()
        except Exception:
            pass


def safe_sleep(seconds):
    remaining_ms = max(0, int(seconds * 1000))
    while remaining_ms > 0:
        feed_watchdog()
        step_ms = min(200, remaining_ms)
        time.sleep(step_ms / 1000)
        remaining_ms -= step_ms


def telemetry_enabled():
    return bool(STATS_API_URL)


def wifi_connected():
    try:
        wlan = network.WLAN(network.STA_IF)
        return bool(wlan and wlan.active() and wlan.isconnected())
    except Exception:
        return False


def power_snapshot():
    voltage, on_usb = read_battery()
    battery_v = round(voltage, 3) if voltage > 0 else None
    return battery_v, on_usb


def post_device_stats(event_name, mode, ntp_ok, bitmap_assets_ok, sync_text, wifi_text):
    request_mod = get_urequests()
    if not STATS_API_URL or not request_mod:
        return False

    # Never block trying to post if STA is offline.
    if not wifi_connected():
        return False

    battery_v, usb_powered = power_snapshot()

    payload = {
        "event": event_name,
        "project_key": STATS_PROJECT_KEY,
        "device_id": DEVICE_ID,
        "device_profile": DEVICE_PROFILE,
        "display_model": DISPLAY_MODEL,
        "app_version": APP_VERSION,
        "mode": mode,
        "ntp_ok": bool(ntp_ok),
        "bitmap_assets_ok": bool(bitmap_assets_ok),
        "mem_free": gc.mem_free(),
        "mem_alloc": gc.mem_alloc(),
        "uptime_s": int(time.ticks_ms() // 1000),
        "unix_ts": int(time.time()),
        "wifi": wifi_text,
        "sync": sync_text,
        "wdt_enabled": bool(WATCHDOG),
        "wdt_timeout_ms": WATCHDOG_TIMEOUT_MS,
        "wdt_clamped": bool(WATCHDOG_CLAMPED),
    }

    if battery_v is not None:
        payload["battery_v"] = battery_v
    if usb_powered is not None:
        payload["usb_powered"] = usb_powered

    headers = {"Content-Type": "application/json"}
    if STATS_API_TOKEN:
        headers["Authorization"] = "Bearer {}".format(STATS_API_TOKEN)

    resp = None
    old_timeout = None
    try:
        feed_watchdog()
        if socket and hasattr(socket, "getdefaulttimeout"):
            try:
                old_timeout = socket.getdefaulttimeout()
            except Exception:
                old_timeout = None
        if socket and hasattr(socket, "setdefaulttimeout"):
            try:
                # Keep HTTP timeout comfortably below WDT timeout to avoid starving feeds.
                timeout_cap = max(1, (WATCHDOG_TIMEOUT_MS // 1000) - 3)
                socket.setdefaulttimeout(min(STATS_HTTP_TIMEOUT_S, timeout_cap))
            except Exception:
                pass
        resp = request_mod.post(STATS_API_URL, data=json.dumps(payload), headers=headers)
        feed_watchdog()
        return True
    except Exception:
        return False
    finally:
        if resp is not None:
            try:
                resp.close()
            except Exception:
                pass
        if socket and hasattr(socket, "setdefaulttimeout"):
            try:
                socket.setdefaulttimeout(old_timeout)
            except Exception:
                pass


def connect_wifi(timeout_s=WIFI_CONNECT_TIMEOUT_S):
    """Connect to Wi-Fi; returns (wlan_or_none, wifi_status_text)."""
    if secrets is None:
        return None, "WiFi: no secrets.py"

    ssid = getattr(secrets, "WIFI_SSID", None)
    password = getattr(secrets, "WIFI_PASSWORD", None)
    if not ssid or not password:
        return None, "WiFi: missing creds"

    country = getattr(secrets, "WIFI_COUNTRY", "CA")
    try:
        network.country(country)
    except Exception:
        pass

    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    # Pimoroni examples disable Wi-Fi power saving for compatibility with some APs.
    try:
        wlan.config(pm=0xA11140)
    except Exception:
        pass

    if wlan.isconnected():
        return wlan, "WiFi: {}".format(ssid)

    wlan.connect(ssid, password)
    start_ms = mono_ms()
    timeout_ms = int(timeout_s * 1000)
    while not wlan.isconnected() and mono_diff(mono_ms(), start_ms) < timeout_ms:
        feed_watchdog()
        try:
            if wlan.status() < 0:
                break
        except Exception:
            pass
        safe_sleep(0.2)

    if wlan.isconnected():
        return wlan, "WiFi: {}".format(ssid)

    status = "?"
    try:
        status = str(wlan.status())
    except Exception:
        pass
    try:
        wlan.disconnect()
    except Exception:
        pass
    try:
        wlan.active(False)
    except Exception:
        pass
    return None, "WiFi fail s={}".format(status)


def has_keys(mapping, keys):
    if not mapping:
        return False
    for key in keys:
        if key not in mapping:
            return False
    return True


def custom_assets_ready():
    return (
        has_keys(FONT_UI_BIG, REQUIRED_UI_BIG_CHARS)
        and has_keys(FONT_JP, REQUIRED_JP_CHARS)
        and has_keys(FONT_TIME, REQUIRED_TIME_CHARS)
        and has_keys(FONT_DATE, REQUIRED_DATE_CHARS)
    )


def show_asset_error_screen():
    graphics.set_pen(BLACK)
    graphics.clear()
    graphics.set_pen(WHITE)
    set_footer_font()
    graphics.text("FATAL: custom bitmap assets missing", 20, 40, WIDTH - 40, 2)
    graphics.text("Arial/Japanese assets are required.", 20, 80, WIDTH - 40, 2)
    graphics.text("Re-deploy custom_bitmaps.py + main.py", 20, 120, WIDTH - 40, 2)
    graphics.text("Then press RESET and E once.", 20, 160, WIDTH - 40, 2)
    if CUSTOM_BITMAPS_IMPORT_ERROR:
        graphics.text("Import error: {}".format(CUSTOM_BITMAPS_IMPORT_ERROR), 20, 200, WIDTH - 40, 2)
    missing = []
    if not has_keys(FONT_UI_BIG, REQUIRED_UI_BIG_CHARS):
        missing.append("FONT_UI_BIG")
    if not has_keys(FONT_JP, REQUIRED_JP_CHARS):
        missing.append("FONT_JP")
    if not has_keys(FONT_TIME, REQUIRED_TIME_CHARS):
        missing.append("FONT_TIME")
    if not has_keys(FONT_DATE, REQUIRED_DATE_CHARS):
        missing.append("FONT_DATE")
    if missing:
        graphics.text("Missing: {}".format(", ".join(missing)), 20, 240, WIDTH - 40, 2)
    graphics.update()


def disconnect_wifi(wlan):
    """Turn Wi-Fi fully off between refreshes to save power."""
    if not wlan:
        return
    try:
        wlan.disconnect()
    except Exception:
        pass
    try:
        wlan.active(False)
    except Exception:
        pass


def sync_time_ntp():
    """Best-effort sync compatible with older/newer Inky firmware builds."""
    ntptime.timeout = 10
    hosts = ("pool.ntp.org", "time.google.com", "time.cloudflare.com")
    last_err = "unknown"

    for host in hosts:
        ntptime.host = host
        for _ in range(NTP_RETRIES):
            try:
                feed_watchdog()
                # Some firmware builds expose inky_frame.set_time(), others do not.
                if hasattr(inky_frame, "set_time"):
                    inky_frame.set_time()
                else:
                    ntptime.settime()
                feed_watchdog()
                return True, "NTP ok"
            except Exception as exc:
                last_err = type(exc).__name__
                safe_sleep(1)

    return False, "NTP fail {}".format(last_err)


def timezone_struct(utc_epoch, offset_hours):
    """Return a gmtime tuple shifted by fixed hour offset."""
    return time.gmtime(utc_epoch + (offset_hours * 3600))


def fmt_time(t):
    return "{:02d}:{:02d}".format(t[3], t[4])


def fmt_date(t):
    return "{:04d}/{:02d}/{:02d}".format(t[0], t[1], t[2])


def fmt_date_jp(t):
    return "{:04d}年{:02d}月{:02d}日".format(t[0], t[1], t[2])


def fmt_date_en(t):
    months = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    return "{} {:d}, {:04d}".format(months[t[1] - 1], t[2], t[0])


def fmt_weekday_en(t):
    days = ("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")
    return days[t[6] % 7]


def clock_looks_valid(utc_epoch):
    """Treat default firmware RTC years as invalid until NTP sync succeeds."""
    return time.gmtime(utc_epoch)[0] >= MIN_VALID_YEAR


def next_refresh_delay_s(current_epoch):
    """Retry quickly while RTC is invalid, otherwise use normal cadence."""
    if not clock_looks_valid(current_epoch):
        return INVALID_CLOCK_RETRY_SECONDS
    return REFRESH_SECONDS


def should_attempt_ntp(current_epoch, last_ntp_sync_epoch):
    if not clock_looks_valid(current_epoch):
        return True
    if NTP_RESYNC_SECONDS and last_ntp_sync_epoch:
        return (current_epoch - last_ntp_sync_epoch) >= NTP_RESYNC_SECONDS
    return False


def compact_wifi_state(wifi_text):
    if not wifi_text:
        return "wifi=?"
    if "missing creds" in wifi_text:
        return "wifi=nocfg"
    if wifi_text.startswith("WiFi fail"):
        return "wifi=fail"
    if "off" in wifi_text:
        return "wifi=off"
    return "wifi=ok"


def compact_ntp_state(sync_text, ntp_ok):
    if ntp_ok or (sync_text and sync_text.startswith("NTP ok")):
        return "ntp=ok"
    if sync_text and sync_text.startswith("NTP fail"):
        return "ntp=fail"
    if sync_text and sync_text.startswith("NTP: pending"):
        return "ntp=pending"
    return "ntp=?"


def build_diag_line(utc_epoch, last_draw_ms, sync_text, ntp_ok, wifi_text, last_error):
    age_s = max(0, mono_diff(mono_ms(), last_draw_ms) // 1000)
    rtc_state = "rtc=ok" if clock_looks_valid(utc_epoch) else "rtc=bad"
    diag = "diag {}s {} {} {}".format(
        age_s,
        rtc_state,
        compact_ntp_state(sync_text, ntp_ok),
        compact_wifi_state(wifi_text),
    )
    if last_error:
        diag = "{} err={}".format(diag, last_error)
    return diag


def diag_alert_text(utc_epoch, sync_text, ntp_ok, wifi_text, last_error):
    if last_error:
        return "ERR {}".format(last_error)
    if not clock_looks_valid(utc_epoch):
        return "RTC BAD"
    if sync_text and sync_text.startswith("NTP fail"):
        return "NTP FAIL"
    if wifi_text and wifi_text.startswith("WiFi fail"):
        return wifi_text
    return ""


def read_jp_city_button():
    """For japan profile: A=local, B=remote, C=toggle.  Returns True if city changed."""
    try:
        if inky_frame.button_a.read():
            if _jp_city["name"] != LOCAL_CITY_NAME:
                jp_set_city(LOCAL_CITY_NAME, LOCAL_CITY_NAME_JP, LOCAL_UTC_OFFSET, LOCAL_TZ_LABEL)
                return True
            return "refresh"
        if inky_frame.button_b.read():
            if _jp_city["name"] != REMOTE_CITY_NAME:
                jp_set_city(REMOTE_CITY_NAME, REMOTE_CITY_NAME_JP, REMOTE_UTC_OFFSET, REMOTE_TZ_LABEL)
                return True
            return "refresh"
        if inky_frame.button_c.read():
            jp_toggle_city()
            return True
    except Exception:
        pass
    return False


def read_battery():
    """Return (voltage, on_usb).  voltage is VSYS in volts."""
    try:
        import machine
        adc = machine.ADC(29)
        raw = adc.read_u16()
        voltage = raw * 3 * 3.3 / 65535
        on_usb = machine.Pin('WL_GPIO2', machine.Pin.IN).value() == 1
        return voltage, on_usb
    except Exception:
        return 0.0, True


def battery_label():
    voltage, on_usb = read_battery()
    if on_usb:
        return "USB"
    # Li-ion 3.7V cell: 4.2V full, 3.0V cutoff
    pct = max(0, min(100, int((voltage - 3.0) / (4.2 - 3.0) * 100)))
    return "{}% {:.2f}V".format(pct, voltage)


def read_mode_button(current_mode):
    """Return selected mode from A-C if a button is pressed."""
    if JAPAN_ONLY_PROFILE:
        return MODE_C
    try:
        if inky_frame.button_a.read():
            return MODE_A
        if inky_frame.button_b.read():
            return MODE_B
        if inky_frame.button_c.read():
            return MODE_C
    except Exception:
        pass
    return current_mode


def force_refresh_pressed():
    """E button forces immediate refresh."""
    try:
        return inky_frame.button_e.read()
    except Exception:
        return False


def api_button_pressed():
    """D button sends a dedicated API event without redrawing the screen."""
    try:
        return inky_frame.button_d.read()
    except Exception:
        return False


def wifi_label(wlan):
    if wlan and wlan.isconnected() and secrets:
        ssid = getattr(secrets, "WIFI_SSID", "")
        if ssid:
            return "WiFi: {}".format(ssid)
        return "WiFi: connected"
    return "WiFi: off"


def midnight_epoch(utc_struct):
    """Epoch for midnight UTC for a given UTC date struct."""
    return time.mktime((utc_struct[0], utc_struct[1], utc_struct[2], 0, 0, 0, 0, 0))


def next_meetings(now_utc_epoch, count=5):
    """Return upcoming meeting epochs in UTC from a simple daily schedule."""
    candidates = []
    for day_offset in range(0, 5):
        day_struct = time.gmtime(now_utc_epoch + (day_offset * 86400))
        day0 = midnight_epoch(day_struct)
        for title, hour_utc, minute_utc in SAMPLE_MEETINGS_UTC:
            candidates.append((title, day0 + (hour_utc * 3600) + (minute_utc * 60)))

    candidates.sort(key=lambda item: item[1])
    return [item for item in candidates if item[1] >= now_utc_epoch][:count]


def fmt_meeting_line(meeting, offset_hours):
    title, utc_epoch = meeting
    local_t = timezone_struct(utc_epoch, offset_hours)
    return "{} {:02d}:{:02d}".format(title, local_t[3], local_t[4])


def overlap_text_lines(now_utc_epoch):
    """D mode: simple overlap helper for planning calls."""
    now_local = timezone_struct(now_utc_epoch, PST_OFFSET_HOURS)
    now_remote = timezone_struct(now_utc_epoch, JST_OFFSET_HOURS)

    # Suggested overlap windows in local time, then converted to remote label.
    windows_local = [(16, 0, 18, 0), (19, 0, 21, 0)]
    lines = [
        "Best overlap windows:",
        "",
    ]

    offset_delta = JST_OFFSET_HOURS - PST_OFFSET_HOURS
    for start_h, start_m, end_h, end_m in windows_local:
        start_remote_h = (start_h + offset_delta) % 24
        end_remote_h = (end_h + offset_delta) % 24
        lines.append(
            "{} {:02d}:{:02d}-{:02d}:{:02d} | {} {:02d}:{:02d}-{:02d}:{:02d}".format(
                LOCAL_TZ_LABEL,
                start_h,
                start_m,
                end_h,
                end_m,
                REMOTE_TZ_LABEL,
                start_remote_h,
                start_m,
                end_remote_h,
                end_m,
            )
        )

    lines.append("")
    lines.append(
        "Now {} {:02d}:{:02d} | {} {:02d}:{:02d}".format(
            LOCAL_TZ_LABEL,
            now_local[3],
            now_local[4],
            REMOTE_TZ_LABEL,
            now_remote[3],
            now_remote[4],
        )
    )
    return lines


def set_best_font():
    """Use a cleaner font if available on this firmware, else fall back."""
    # sans is the closest built-in style to Arial/Helvetica.
    for font_name in ("sans", "bitmap8"):
        try:
            graphics.set_font(font_name)
            return
        except Exception:
            pass


def set_footer_font():
    """Use classic bitmap footer text regardless of main font style."""
    try:
        graphics.set_font("bitmap8")
    except Exception:
        pass


def draw_footer(status, wifi_text, diag_text):
    set_footer_font()
    bat = battery_label()
    draw_text_bold(status, 20, HEIGHT - 54, WIDTH - 40, 2, bold=False)
    left_text = "E=Refresh"
    right_text = wifi_text
    if diag_text:
        right_text = diag_text
    draw_text_bold(left_text, 20, HEIGHT - 34, WIDTH // 2, 2, bold=False)
    draw_text_bold(right_text, FOOTER_RIGHT_X, HEIGHT - 34, FOOTER_RIGHT_W, 2, bold=False)
    draw_text_bold(bat, FOOTER_RIGHT_X, HEIGHT - 54, FOOTER_RIGHT_W, 2, bold=False)


def draw_syncing_screen(wifi_text, diag_text):
    clear_inverted()
    set_best_font()

    graphics.rectangle((WIDTH // 2) - 2, 0, 4, HEIGHT)

    if custom_assets_ready():
        draw_bitmap_text_bottom(LOCAL_CITY_NAME, FONT_UI_BIG, LEFT_X, TITLE_BOTTOM, COL_W, spacing=COL_W_SPACING)
        draw_bitmap_text_bottom(REMOTE_CITY_NAME, FONT_UI_BIG, RIGHT_X, TITLE_BOTTOM, COL_W, spacing=COL_W_SPACING)

        jp_y = TITLE_BOTTOM + JP_LABEL_Y_OFFSET
        draw_bitmap_text_bottom(
            LOCAL_CITY_NAME_JP,
            FONT_JP,
            LEFT_X,
            jp_y + bitmap_text_height(LOCAL_CITY_NAME_JP, FONT_JP),
            COL_W,
            spacing=COL_W_SPACING,
            char_y_offsets={"ー": -12} if "ー" in LOCAL_CITY_NAME_JP else None,
        )
        draw_bitmap_text_bottom(
            REMOTE_CITY_NAME_JP,
            FONT_JP,
            RIGHT_X,
            jp_y + bitmap_text_height(REMOTE_CITY_NAME_JP, FONT_JP),
            COL_W,
            spacing=COL_W_SPACING,
        )

        draw_bitmap_text_bottom(
            "00:00",
            FONT_TIME,
            LEFT_X,
            TIME_Y_BOTTOM,
            COL_W,
            spacing=TIME_SPACING,
            height_scale=TIME_SCALE_FACTOR,
            center_chars={":"},
            center_reference_chars=set("0123456789"),
            char_y_offsets={":": TIME_COLON_Y_OFFSET},
        )
        draw_bitmap_text_bottom(
            "00:00",
            FONT_TIME,
            RIGHT_X,
            TIME_Y_BOTTOM,
            COL_W,
            spacing=TIME_SPACING,
            height_scale=TIME_SCALE_FACTOR,
            center_chars={":"},
            center_reference_chars=set("0123456789"),
            char_y_offsets={":": TIME_COLON_Y_OFFSET},
        )
    else:
        draw_text_bold(LOCAL_CITY_NAME, LEFT_X, 30, COL_W, 2)
        draw_text_bold(REMOTE_CITY_NAME, RIGHT_X, 30, COL_W, 2)
        draw_text_bold("00:00", LEFT_X, 95, COL_W, 6)
        draw_text_bold("00:00", RIGHT_X, 95, COL_W, 6)

    draw_footer("Syncing time...", wifi_text, diag_text)
    graphics.update()


def draw_text_bold(text, x, y, w, scale, bold=True):
    """Pseudo-bold text by drawing with tiny offsets (set_thickness unsupported)."""
    graphics.text(text, x, y, w, scale)
    if bold:
        graphics.text(text, x + 1, y, w, scale)
        graphics.text(text, x, y + 1, w, scale)
        graphics.text(text, x + 1, y + 1, w, scale)
        graphics.text(text, x + 2, y, w, scale)


def glyph_pixel_on(glyph, x, y):
    data = glyph.get("data")
    if data is not None:
        width = glyph.get("w", 0)
        height = glyph.get("h", 0)
        if x < 0 or y < 0 or x >= width or y >= height:
            return False
        row_bytes = (width + 7) // 8
        idx = (y * row_bytes) + (x // 8)
        if idx >= len(data):
            return False
        return bool(data[idx] & (0x80 >> (x % 8)))

    rows = glyph.get("rows", [])
    if y < 0 or y >= len(rows):
        return False
    row = rows[y]
    if x < 0 or x >= len(row):
        return False
    return row[x] == "#"


def draw_bitmap_label(key, x, y):
    """Draw pre-rendered 1-bit label bitmap, returns True on success."""
    if not FONT_JP or key not in FONT_JP:
        return False

    data = FONT_JP[key]
    glyph_h = data.get("h", 0)
    glyph_w = data.get("w", 0)
    for yy in range(glyph_h):
        if (yy % RENDER_WDT_FEED_ROWS) == 0:
            feed_watchdog()
        for xx in range(glyph_w):
            if glyph_pixel_on(data, xx, yy):
                graphics.pixel(x + xx, y + yy)
    return True


def draw_named_bitmap(dict_map, key, x, y):
    if not dict_map or key not in dict_map:
        return False
    data = dict_map[key]
    glyph_h = data.get("h", 0)
    glyph_w = data.get("w", 0)
    for yy in range(glyph_h):
        if (yy % RENDER_WDT_FEED_ROWS) == 0:
            feed_watchdog()
        for xx in range(glyph_w):
            if glyph_pixel_on(data, xx, yy):
                graphics.pixel(x + xx, y + yy)
    return True


def draw_bitmap_label_centered(key, x, y, max_width):
    if not FONT_JP or key not in FONT_JP:
        return False
    w = FONT_JP[key].get("w", 0)
    start_x = x + max((max_width - w) // 2, 0)
    return draw_named_bitmap(FONT_JP, key, start_x, y)


def draw_jp_weekday(weekday_key, x, y_bottom, max_width):
    jp_text = {
        "MONDAY": "月曜日",
        "TUESDAY": "火曜日",
        "WEDNESDAY": "水曜日",
        "THURSDAY": "木曜日",
        "FRIDAY": "金曜日",
        "SATURDAY": "土曜日",
        "SUNDAY": "日曜日",
    }.get(weekday_key)
    if not jp_text:
        return False
    return draw_bitmap_text_bottom(jp_text, FONT_JP, x, y_bottom, max_width, spacing=1)


def measure_bitmap_text(text, font_map, spacing=2):
    if not font_map:
        return 0
    total = 0
    for i, ch in enumerate(text):
        glyph = font_map.get(ch)
        if not glyph:
            continue
        total += glyph["w"]
        if i < len(text) - 1:
            total += spacing
    return total


def measure_bitmap_text_scaled(text, font_map, spacing=2, scale=1.0):
    if not font_map:
        return 0
    if scale <= 1.0:
        return measure_bitmap_text(text, font_map, spacing=spacing)

    total = 0
    for i, ch in enumerate(text):
        glyph = font_map.get(ch)
        if not glyph:
            continue
        total += max(1, int(round(glyph["w"] * scale)))
        if i < len(text) - 1:
            total += spacing
    return total


def glyph_ink_bounds(glyph):
    top = None
    bottom = None
    glyph_h = glyph.get("h", 0)
    glyph_w = glyph.get("w", 0)
    for yy in range(glyph_h):
        row_has_ink = False
        for xx in range(glyph_w):
            if glyph_pixel_on(glyph, xx, yy):
                row_has_ink = True
                break
        if row_has_ink:
            if top is None:
                top = yy
            bottom = yy
    if top is None:
        h = glyph.get("h", 0)
        if h <= 0:
            return 0, 0
        return 0, h - 1
    return top, bottom


def draw_bitmap_text(text, font_map, x, y, max_width, spacing=2):
    """Draw text from custom bitmap glyphs centered in the provided width."""
    if not font_map:
        return False

    text_w = measure_bitmap_text(text, font_map, spacing=spacing)
    start_x = x + max((max_width - text_w) // 2, 0)
    cx = start_x
    line_h = bitmap_text_height(text, font_map)

    for ch in text:
        glyph = font_map.get(ch)
        if not glyph:
            continue
        feed_watchdog()
        glyph_h = glyph.get("h", 0)
        glyph_w = glyph.get("w", 0)
        glyph_y = y + max(0, line_h - glyph_h)
        for yy in range(glyph_h):
            if (yy % RENDER_WDT_FEED_ROWS) == 0:
                feed_watchdog()
            for xx in range(glyph_w):
                if glyph_pixel_on(glyph, xx, yy):
                    graphics.pixel(cx + xx, glyph_y + yy)
        cx += glyph["w"] + spacing
    return True


def draw_bitmap_text_scaled(
    text,
    font_map,
    x,
    y,
    max_width,
    spacing=2,
    scale=1.0,
    center_chars=None,
    center_reference_chars=None,
    char_y_offsets=None,
):
    """Draw text from bitmap glyphs with nearest-neighbor scaling."""
    if scale <= 1.0 and not center_chars and not char_y_offsets:
        return draw_bitmap_text(text, font_map, x, y, max_width, spacing=spacing)
    if not font_map:
        return False

    text_w = measure_bitmap_text_scaled(text, font_map, spacing=spacing, scale=scale)
    start_x = x + max((max_width - text_w) // 2, 0)
    cx = start_x
    line_h_scaled = max(1, int(round(bitmap_text_height(text, font_map) * scale)))

    target_center = None
    if center_chars:
        ref_centers = []
        ref_chars = center_reference_chars or set()
        for ch in text:
            if ref_chars and ch not in ref_chars:
                continue
            glyph = font_map.get(ch)
            if not glyph:
                continue
            top, bottom = glyph_ink_bounds(glyph)
            ref_centers.append((top + bottom) * 0.5 * scale)
        if ref_centers:
            target_center = sum(ref_centers) / len(ref_centers)

    for ch in text:
        glyph = font_map.get(ch)
        if not glyph:
            continue
        feed_watchdog()

        src_h = glyph.get("h", 0)
        src_w = glyph.get("w", 0)
        if src_h <= 0 or src_w <= 0:
            continue

        dst_w = max(1, int(round(src_w * scale)))
        dst_h = max(1, int(round(src_h * scale)))
        glyph_y = y + max(0, line_h_scaled - dst_h)

        if center_chars and ch in center_chars and target_center is not None:
            top, bottom = glyph_ink_bounds(glyph)
            glyph_center = (top + bottom) * 0.5 * scale
            glyph_y += int(round(target_center - glyph_center))

        if char_y_offsets and ch in char_y_offsets:
            glyph_y += char_y_offsets[ch]

        for yy in range(dst_h):
            if (yy % RENDER_WDT_FEED_ROWS) == 0:
                feed_watchdog()
            src_y = min(src_h - 1, int(yy / scale))
            for xx in range(dst_w):
                src_x = min(src_w - 1, int(xx / scale))
                if glyph_pixel_on(glyph, src_x, src_y):
                    graphics.pixel(cx + xx, glyph_y + yy)

        cx += dst_w + spacing
    return True


def bitmap_text_height(text, font_map):
    if not font_map:
        return 0
    return max((font_map[ch]["h"] for ch in text if ch in font_map), default=0)


def draw_bitmap_text_bottom(
    text,
    font_map,
    x,
    y_bottom,
    max_width,
    spacing=2,
    height_scale=1.0,
    center_chars=None,
    center_reference_chars=None,
    char_y_offsets=None,
):
    h = bitmap_text_height(text, font_map)
    y = y_bottom - int(h * height_scale)
    return draw_bitmap_text_scaled(
        text,
        font_map,
        x,
        y,
        max_width,
        spacing=spacing,
        scale=height_scale,
        center_chars=center_chars,
        center_reference_chars=center_reference_chars,
        char_y_offsets=char_y_offsets,
    )


def fit_scale(text, max_scale, min_scale=1, max_width=None):
    """Find the largest text scale that fits in the target width."""
    if max_width is None:
        max_width = COL_W - 8
    for scale in range(max_scale, min_scale - 1, -1):
        try:
            if graphics.measure_text(text, scale=scale) <= max_width:
                return scale
        except Exception:
            # Older firmware sometimes has stricter measure_text signatures.
            if graphics.measure_text(text, scale) <= max_width:
                return scale
    return min_scale


def clear_inverted():
    graphics.set_pen(BLACK)
    graphics.clear()
    graphics.set_pen(WHITE)


def draw_mode_a(pst, jst, sync_ok, wifi_text, diag_text):
    clear_inverted()
    set_best_font()

    # Strict 2-column layout.
    graphics.rectangle((WIDTH // 2) - 2, 0, 4, HEIGHT)

    # Keep core clock running even if bitmap assets fail to import.
    if not custom_assets_ready():
        draw_text_bold(LOCAL_CITY_NAME, LEFT_X, 30, COL_W, 2)
        draw_text_bold(REMOTE_CITY_NAME, RIGHT_X, 30, COL_W, 2)
        draw_text_bold(fmt_time(pst), LEFT_X, 95, COL_W, 6)
        draw_text_bold(fmt_time(jst), RIGHT_X, 95, COL_W, 6)
        draw_text_bold(fmt_date(pst), LEFT_X, 230, COL_W, 2, bold=False)
        draw_text_bold(fmt_date_jp(jst), RIGHT_X, 230, COL_W, 2, bold=False)

        weekday_keys = ("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")
        weekday_en_map = {
            "MONDAY": "MONDAY",
            "TUESDAY": "TUESDAY",
            "WEDNESDAY": "WEDNESDAY",
            "THURSDAY": "THURSDAY",
            "FRIDAY": "FRIDAY",
            "SATURDAY": "SATURDAY",
            "SUNDAY": "SUNDAY",
        }
        draw_text_bold(weekday_en_map.get(weekday_keys[pst[6] % 7], "MONDAY"), LEFT_X, 290, COL_W, 2, bold=False)
        draw_text_bold(weekday_keys[jst[6] % 7], RIGHT_X, 290, COL_W, 2, bold=False)

        status = "A={}+{} | NTP synced".format(LOCAL_TZ_LABEL, REMOTE_TZ_LABEL) if sync_ok else "A={}+{} | Clock not synced".format(LOCAL_TZ_LABEL, REMOTE_TZ_LABEL)
        draw_footer(status, wifi_text, diag_text)
        graphics.update()
        return

    # Bottom-align city titles, then keep Japanese labels centered just below.
    draw_bitmap_text_bottom(LOCAL_CITY_NAME, FONT_UI_BIG, LEFT_X, TITLE_BOTTOM, COL_W, spacing=COL_W_SPACING)
    draw_bitmap_text_bottom(REMOTE_CITY_NAME, FONT_UI_BIG, RIGHT_X, TITLE_BOTTOM, COL_W, spacing=COL_W_SPACING)

    # Japanese labels centered under titles with tighter spacing.
    jp_y = TITLE_BOTTOM + JP_LABEL_Y_OFFSET
    draw_bitmap_text_bottom(
        LOCAL_CITY_NAME_JP,
        FONT_JP,
        LEFT_X,
        jp_y + bitmap_text_height(LOCAL_CITY_NAME_JP, FONT_JP),
        COL_W,
        spacing=COL_W_SPACING,
        char_y_offsets={"ー": -12} if "ー" in LOCAL_CITY_NAME_JP else None,
    )
    draw_bitmap_text_bottom(
        REMOTE_CITY_NAME_JP,
        FONT_JP,
        RIGHT_X,
        jp_y + bitmap_text_height(REMOTE_CITY_NAME_JP, FONT_JP),
        COL_W,
        spacing=COL_W_SPACING,
    )
    set_best_font()

    # Render times from thick custom bitmap digit font, bottom-aligned, 50% larger.
    pst_time = fmt_time(pst)
    jst_time = fmt_time(jst)
    draw_bitmap_text_bottom(
        pst_time,
        FONT_TIME,
        LEFT_X,
        TIME_Y_BOTTOM,
        COL_W,
        spacing=TIME_SPACING,
        height_scale=TIME_SCALE_FACTOR,
        center_chars={":"},
        center_reference_chars=set("0123456789"),
        char_y_offsets={":": TIME_COLON_Y_OFFSET},
    )
    draw_bitmap_text_bottom(
        jst_time,
        FONT_TIME,
        RIGHT_X,
        TIME_Y_BOTTOM,
        COL_W,
        spacing=TIME_SPACING,
        height_scale=TIME_SCALE_FACTOR,
        center_chars={":"},
        center_reference_chars=set("0123456789"),
        char_y_offsets={":": TIME_COLON_Y_OFFSET},
    )

    # Render dates from custom bitmap date font, bottom-aligned
    pst_date = fmt_date(pst)
    jst_date = fmt_date_jp(jst)
    draw_bitmap_text_bottom(pst_date, FONT_DATE, LEFT_X, DATE_Y_BOTTOM, COL_W, spacing=DATE_SPACING)
    draw_bitmap_text_bottom(jst_date, FONT_DATE, RIGHT_X, DATE_Y_BOTTOM, COL_W, spacing=DATE_SPACING)

    # Center the weekday name below the date, using bitmap font for English and Japanese
    weekday_keys = ("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")
    weekday_en_map = {
        "MONDAY": "MONDAY",
        "TUESDAY": "TUESDAY",
        "WEDNESDAY": "WEDNESDAY",
        "THURSDAY": "THURSDAY",
        "FRIDAY": "FRIDAY",
        "SATURDAY": "SATURDAY",
        "SUNDAY": "SUNDAY",
    }
    pst_weekday_key = weekday_keys[pst[6] % 7]
    jst_weekday_key = weekday_keys[jst[6] % 7]
    # English weekday (bitmap font, bottom-aligned, centered)
    weekday_text = weekday_en_map.get(pst_weekday_key, "MONDAY")
    draw_bitmap_text_bottom(weekday_text, FONT_UI_BIG, LEFT_X, WEEKDAY_Y_BOTTOM, COL_W, spacing=COL_W_SPACING)
    draw_jp_weekday(jst_weekday_key, RIGHT_X, WEEKDAY_Y_BOTTOM, COL_W)

    status = "A={}+{} | NTP synced".format(LOCAL_TZ_LABEL, REMOTE_TZ_LABEL) if sync_ok else "A={}+{} | Clock not synced".format(LOCAL_TZ_LABEL, REMOTE_TZ_LABEL)
    draw_footer(status, wifi_text, diag_text)

    graphics.update()


def draw_mode_b(now_utc_epoch, pst, sync_ok, wifi_text, diag_text):
    meetings = next_meetings(now_utc_epoch, count=5)

    clear_inverted()
    set_best_font()

    draw_text_bold("B {} + Meetings".format(LOCAL_CITY_NAME), 20, 10, WIDTH - 40, 2, bold=False)
    draw_bitmap_text_bottom(LOCAL_CITY_NAME, FONT_UI_BIG, 20, 78, WIDTH - 40, spacing=COL_W_SPACING)
    draw_bitmap_text_bottom(
        fmt_time(pst),
        FONT_TIME,
        20,
        178,
        WIDTH - 40,
        spacing=TIME_SPACING,
        height_scale=1.12,
        center_chars={":"},
        center_reference_chars=set("0123456789"),
        char_y_offsets={":": TIME_COLON_Y_OFFSET},
    )
    draw_bitmap_text_bottom(fmt_date(pst), FONT_DATE, 20, 228, WIDTH - 40, spacing=DATE_SPACING)

    y = 240
    draw_text_bold("Upcoming:", 20, y, WIDTH - 40, 2, bold=False)
    y += 30
    for meeting in meetings:
        draw_text_bold(fmt_meeting_line(meeting, PST_OFFSET_HOURS), 20, y, WIDTH - 40, 2, bold=False)
        y += 28

    status = "NTP synced" if sync_ok else "Clock not synced"
    draw_footer(status, wifi_text, diag_text)
    graphics.update()


def draw_mode_c(now_utc_epoch, jst, sync_ok, wifi_text, diag_text):
    meetings = next_meetings(now_utc_epoch, count=5)

    clear_inverted()
    set_best_font()

    draw_text_bold("C {} + Meetings".format(REMOTE_CITY_NAME), 20, 10, WIDTH - 40, 2, bold=False)
    draw_bitmap_text_bottom(REMOTE_CITY_NAME, FONT_UI_BIG, 20, 78, WIDTH - 40, spacing=COL_W_SPACING)
    draw_bitmap_text_bottom(
        fmt_time(jst),
        FONT_TIME,
        20,
        178,
        WIDTH - 40,
        spacing=TIME_SPACING,
        height_scale=1.12,
        center_chars={":"},
        center_reference_chars=set("0123456789"),
        char_y_offsets={":": TIME_COLON_Y_OFFSET},
    )
    draw_bitmap_text_bottom(fmt_date(jst), FONT_DATE, 20, 228, WIDTH - 40, spacing=DATE_SPACING)

    y = 240
    draw_text_bold("Upcoming:", 20, y, WIDTH - 40, 2, bold=False)
    y += 30
    for meeting in meetings:
        draw_text_bold(fmt_meeting_line(meeting, JST_OFFSET_HOURS), 20, y, WIDTH - 40, 2, bold=False)
        y += 28

    status = "NTP synced" if sync_ok else "Clock not synced"
    draw_footer(status, wifi_text, diag_text)
    graphics.update()


def draw_mode_d(now_utc_epoch, sync_ok, wifi_text, diag_text):
    clear_inverted()
    set_best_font()

    draw_bitmap_text_bottom("OVERLAP", FONT_UI_BIG, 20, 66, WIDTH - 40, spacing=COL_W_SPACING)
    draw_bitmap_text_bottom("HELPER", FONT_UI_BIG, 20, 100, WIDTH - 40, spacing=COL_W_SPACING)
    y = 126
    for line in overlap_text_lines(now_utc_epoch):
        draw_text_bold(line, 20, y, WIDTH - 40, 2, bold=False)
        y += 30

    status = "NTP synced" if sync_ok else "Clock not synced"
    draw_footer(status, wifi_text, diag_text)
    graphics.update()


def draw_mode_e(pst, jst, sync_ok, wifi_text, diag_text):
    clear_inverted()
    set_best_font()

    graphics.rectangle((WIDTH // 2) - 2, 0, 4, HEIGHT)

    # Note: full kanji rendering needs custom font data; default firmware fonts are limited.
    draw_text_bold("E Nihongo View", 20, 14, WIDTH - 40, 2, bold=False)
    draw_text_bold(LOCAL_CITY_NAME, LEFT_X, 52, COL_W, 2)
    draw_text_bold(REMOTE_CITY_NAME, RIGHT_X, 52, COL_W, 2)

    draw_text_bold(fmt_time(pst), LEFT_X, 120, COL_W, 6)
    draw_text_bold(fmt_time(jst), RIGHT_X, 120, COL_W, 6)

    draw_text_bold(LOCAL_TZ_LABEL, LEFT_X, 236, COL_W, 2, bold=False)
    draw_text_bold(REMOTE_TZ_LABEL, RIGHT_X, 236, COL_W, 2, bold=False)

    draw_text_bold("{:04d}/{:02d}/{:02d}".format(pst[0], pst[1], pst[2]), LEFT_X, 270, COL_W, 2)
    draw_text_bold("{:04d}/{:02d}/{:02d}".format(jst[0], jst[1], jst[2]), RIGHT_X, 270, COL_W, 2)

    status = "NTP synced" if sync_ok else "Clock not synced"
    draw_footer(status, wifi_text, diag_text)
    graphics.update()


def draw_mode_japan_only(jst, sync_ok, wifi_text, diag_text):
    clear_inverted()
    set_best_font()

    # Tighter layout: same physical font size as 7.3" (PPI compensation).
    title_bottom = max(44, int(HEIGHT * 0.12))
    jp_y = title_bottom + JP_LABEL_Y_OFFSET
    label_bottom = jp_y + bitmap_text_height(city_name_jp, FONT_JP) if custom_assets_ready() else title_bottom + 30
    time_bottom = max(label_bottom + 58, int(HEIGHT * 0.52))
    date_bottom = max(time_bottom + 36, int(HEIGHT * 0.70))
    weekday_bottom = max(date_bottom + 30, int(HEIGHT * 0.80))

    city_name = _jp_city["name"]
    city_name_jp = _jp_city["name_jp"]
    city_offset = _jp_city["offset"]
    city_tz = _jp_city["tz"]
    is_local = city_name == LOCAL_CITY_NAME
    jst = timezone_struct(time.time(), city_offset)

    if custom_assets_ready():
        draw_bitmap_text_bottom(city_name, FONT_UI_BIG, 20, title_bottom, WIDTH - 40, spacing=COL_W_SPACING)
        draw_bitmap_text_bottom(
            city_name_jp,
            FONT_JP,
            20,
            label_bottom,
            WIDTH - 40,
            spacing=COL_W_SPACING,
            char_y_offsets={"ー": -12} if "ー" in city_name_jp else None,
        )

        # Slightly larger scale on 5.7" to match physical size (131 vs 128 PPI)
        time_scale = TIME_SCALE_FACTOR * 1.05
        draw_bitmap_text_bottom(
            fmt_time(jst),
            FONT_TIME,
            20,
            time_bottom,
            WIDTH - 40,
            spacing=TIME_SPACING,
            height_scale=time_scale,
            center_chars={":"},
            center_reference_chars=set("0123456789"),
            char_y_offsets={":": TIME_COLON_Y_OFFSET},
        )
        if is_local:
            draw_bitmap_text_bottom(fmt_date(jst), FONT_DATE, 20, date_bottom, WIDTH - 40, spacing=DATE_SPACING)
            draw_bitmap_text_bottom(fmt_weekday_en(jst), FONT_UI_BIG, 20, weekday_bottom, WIDTH - 40, spacing=COL_W_SPACING)
        else:
            draw_bitmap_text_bottom(fmt_date_jp(jst), FONT_DATE, 20, date_bottom, WIDTH - 40, spacing=DATE_SPACING)
            weekday_keys = ("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")
            draw_jp_weekday(weekday_keys[jst[6] % 7], 20, weekday_bottom, WIDTH - 40)
    else:
        draw_text_bold(city_name, 20, 24, WIDTH - 40, 2)
        draw_text_bold(fmt_time(jst), 20, max(78, int(HEIGHT * 0.26)), WIDTH - 40, 7)
        if is_local:
            draw_text_bold(fmt_date(jst), 20, max(188, int(HEIGHT * 0.54)), WIDTH - 40, 2, bold=False)
            draw_text_bold(fmt_weekday_en(jst), 20, max(228, int(HEIGHT * 0.64)), WIDTH - 40, 2, bold=False)
        else:
            draw_text_bold(fmt_date_jp(jst), 20, max(188, int(HEIGHT * 0.54)), WIDTH - 40, 2, bold=False)
            draw_text_bold(city_tz, 20, max(228, int(HEIGHT * 0.64)), WIDTH - 40, 2, bold=False)

    status = "A={} B={} C=Swap".format(LOCAL_TZ_LABEL, REMOTE_TZ_LABEL)
    status += " | NTP synced" if sync_ok else " | Not synced"
    draw_footer(status, wifi_text, diag_text)
    graphics.update()


def draw_by_mode(mode_key, now_utc_epoch, pst, jst, sync_ok, wifi_text, diag_text):
    feed_watchdog()
    if JAPAN_ONLY_PROFILE:
        draw_mode_japan_only(jst, sync_ok, wifi_text, diag_text)
        return
    if not clock_looks_valid(now_utc_epoch):
        draw_syncing_screen(wifi_text, diag_text)
        return
    if mode_key == MODE_A:
        draw_mode_a(pst, jst, sync_ok, wifi_text, diag_text)
        return
    if mode_key == MODE_B:
        draw_mode_b(now_utc_epoch, pst, sync_ok, wifi_text, diag_text)
        return
    if mode_key == MODE_C:
        draw_mode_c(now_utc_epoch, jst, sync_ok, wifi_text, diag_text)
        return
    if mode_key == MODE_D:
        draw_mode_d(now_utc_epoch, sync_ok, wifi_text, diag_text)
        return
    draw_mode_e(pst, jst, sync_ok, wifi_text, diag_text)


def auto_recover_reset(reason_text):
    """Best-effort reboot when refresh loop appears wedged for too long."""
    try:
        clear_inverted()
        set_footer_font()
        draw_text_bold("Auto-recover restart", 20, 20, WIDTH - 40, 2, bold=False)
        draw_text_bold(reason_text, 20, 50, WIDTH - 40, 2, bold=False)
        feed_watchdog()
        graphics.update()
    except Exception:
        pass

    safe_sleep(1)
    if machine and hasattr(machine, "reset"):
        machine.reset()


def run_clock_loop():
    bitmap_assets_ok = custom_assets_ready()

    ntp_ok = False
    sync_text = "NTP: pending"
    wifi_text = "WiFi: off"
    last_error = ""
    last_ntp_sync_epoch = 0
    mode = MODE_C if JAPAN_ONLY_PROFILE else MODE_A

    utc_epoch = time.time()
    if should_attempt_ntp(utc_epoch, last_ntp_sync_epoch):
        attempts = STARTUP_NTP_ATTEMPTS if not clock_looks_valid(utc_epoch) else 1
        for attempt in range(attempts):
            wlan = None
            try:
                feed_watchdog()
                wlan, wifi_text = connect_wifi()
                if wlan:
                    ntp_ok, sync_text = sync_time_ntp()
                    if ntp_ok:
                        last_ntp_sync_epoch = time.time()
                        post_device_stats("boot", mode, ntp_ok, bitmap_assets_ok, sync_text, wifi_text)
                        last_error = ""
                        break
                    last_error = sync_text
                else:
                    last_error = wifi_text
            except Exception as exc:
                sync_text = "Boot err {}".format(type(exc).__name__)
                last_error = type(exc).__name__
            finally:
                disconnect_wifi(wlan)
                if wifi_text.startswith("WiFi: ") and wlan is not None:
                    wifi_text = "WiFi: off (last ok)"

            if attempt < (attempts - 1):
                safe_sleep(2)
    else:
        ntp_ok = True
        sync_text = "RTC ok"
    utc_epoch = time.time()

    pst = timezone_struct(utc_epoch, PST_OFFSET_HOURS)
    jst_offset = _jp_city["offset"] if JAPAN_ONLY_PROFILE else JST_OFFSET_HOURS
    jst = timezone_struct(utc_epoch, jst_offset)
    last_successful_draw_ms = mono_ms()
    diag_text = diag_alert_text(utc_epoch, sync_text, ntp_ok, wifi_text, last_error)

    draw_by_mode(mode, utc_epoch, pst, jst, ntp_ok, wifi_text, diag_text)
    gc.collect()

    # Poll buttons quickly, refresh data every 5 minutes (or E button).
    next_refresh_ms = mono_add(mono_ms(), next_refresh_delay_s(time.time()) * 1000)
    next_stats_ms = mono_add(mono_ms(), STATS_INTERVAL_SECONDS * 1000)
    prev_e_pressed = False
    prev_d_pressed = False
    while True:
        feed_watchdog()

        # Japan profile: A/B/C switch city and force refresh
        if JAPAN_ONLY_PROFILE:
            city_btn = read_jp_city_button()
            if city_btn:
                try:
                    utc_epoch = time.time()
                    pst = timezone_struct(utc_epoch, PST_OFFSET_HOURS)
                    jst = timezone_struct(utc_epoch, _jp_city["offset"])
                    diag_text = diag_alert_text(utc_epoch, sync_text, ntp_ok, wifi_text, last_error)
                    draw_by_mode(mode, utc_epoch, pst, jst, ntp_ok, wifi_text, diag_text)
                    last_successful_draw_ms = mono_ms()
                    event = "city_" + _jp_city["name"].lower()
                    post_device_stats(event, mode, ntp_ok, bitmap_assets_ok, sync_text, wifi_text)
                    gc.collect()
                except Exception as exc:
                    sync_text = "Draw err {}".format(type(exc).__name__)
                    last_error = type(exc).__name__
                safe_sleep(0.3)
                continue

        mode_new = read_mode_button(mode)
        if mode_new != mode:
            mode = mode_new
            try:
                utc_epoch = time.time()
                pst = timezone_struct(utc_epoch, PST_OFFSET_HOURS)
                jst_offset = _jp_city["offset"] if JAPAN_ONLY_PROFILE else JST_OFFSET_HOURS
                jst = timezone_struct(utc_epoch, jst_offset)
                diag_text = diag_alert_text(utc_epoch, sync_text, ntp_ok, wifi_text, last_error)
                draw_by_mode(mode, utc_epoch, pst, jst, ntp_ok, wifi_text, diag_text)
                last_successful_draw_ms = mono_ms()
                post_device_stats("mode_change", mode, ntp_ok, bitmap_assets_ok, sync_text, wifi_text)
                gc.collect()
            except Exception as exc:
                sync_text = "Draw err {}".format(type(exc).__name__)
                last_error = type(exc).__name__
            safe_sleep(0.2)
            continue

        now_epoch = time.time()
        now_ms = mono_ms()
        d_pressed = api_button_pressed()
        manual_api_ping = d_pressed and not prev_d_pressed
        prev_d_pressed = d_pressed
        e_pressed = force_refresh_pressed()
        manual_refresh = e_pressed and not prev_e_pressed
        prev_e_pressed = e_pressed

        if manual_api_ping:
            wlan = None
            try:
                utc_epoch = time.time()
                wlan, wifi_text = connect_wifi()
                if wlan and should_attempt_ntp(utc_epoch, last_ntp_sync_epoch):
                    ntp_ok, sync_text = sync_time_ntp()
                    if ntp_ok:
                        last_ntp_sync_epoch = time.time()
                elif clock_looks_valid(utc_epoch):
                    ntp_ok = True
                    sync_text = "RTC ok"
                if wlan:
                    post_device_stats("button_d", MODE_D, ntp_ok, bitmap_assets_ok, sync_text, wifi_text)
                last_error = ""
            except Exception as exc:
                last_error = type(exc).__name__
            finally:
                disconnect_wifi(wlan)
                if wifi_text.startswith("WiFi: ") and wlan is not None:
                    wifi_text = "WiFi: off (last ok)"
                gc.collect()
            safe_sleep(0.3)
            continue

        if mono_diff(now_ms, next_refresh_ms) >= 0 or manual_refresh:
            wlan = None
            try:
                utc_epoch = time.time()
                force_network = manual_refresh or should_attempt_ntp(utc_epoch, last_ntp_sync_epoch)
                if force_network:
                    wlan, wifi_text = connect_wifi()
                    if wlan:
                        ntp_ok, sync_text = sync_time_ntp()
                        if ntp_ok:
                            last_ntp_sync_epoch = time.time()
                elif clock_looks_valid(utc_epoch):
                    ntp_ok = True
                    sync_text = "RTC ok"
                    wifi_text = "WiFi: off"

                utc_epoch = time.time()
                pst = timezone_struct(utc_epoch, PST_OFFSET_HOURS)
                jst_offset = _jp_city["offset"] if JAPAN_ONLY_PROFILE else JST_OFFSET_HOURS
                jst = timezone_struct(utc_epoch, jst_offset)
                diag_text = diag_alert_text(utc_epoch, sync_text, ntp_ok, wifi_text, last_error)
                draw_by_mode(mode, utc_epoch, pst, jst, ntp_ok, wifi_text, diag_text)
                last_successful_draw_ms = mono_ms()
                last_error = ""
                if wlan:
                    event_mode = MODE_E if manual_refresh else mode
                    post_device_stats("refresh", event_mode, ntp_ok, bitmap_assets_ok, sync_text, wifi_text)
            except Exception as exc:
                sync_text = "Loop err {}".format(type(exc).__name__)
                last_error = type(exc).__name__
            finally:
                disconnect_wifi(wlan)
                if wifi_text.startswith("WiFi: ") and wlan is not None:
                    wifi_text = "WiFi: off (last ok)"
                gc.collect()

            next_refresh_ms = mono_add(mono_ms(), next_refresh_delay_s(time.time()) * 1000)
            if manual_refresh:
                safe_sleep(0.3)

        if telemetry_enabled() and mono_diff(mono_ms(), next_stats_ms) >= 0:
            wlan = None
            try:
                wlan, hb_wifi_text = connect_wifi()
                if wlan:
                    post_device_stats("heartbeat", mode, ntp_ok, bitmap_assets_ok, sync_text, hb_wifi_text)
            except Exception as exc:
                last_error = type(exc).__name__
            finally:
                disconnect_wifi(wlan)
            next_stats_ms = mono_add(mono_ms(), STATS_INTERVAL_SECONDS * 1000)

        if ENABLE_AUTO_RECOVER_RESET and mono_diff(mono_ms(), last_successful_draw_ms) > (STALE_RESTART_SECONDS * 1000):
            auto_recover_reset("No refresh for {}m".format(STALE_RESTART_SECONDS // 60))

        safe_sleep(0.2)


def main():
    while True:
        try:
            run_clock_loop()
        except Exception as exc:
            try:
                clear_inverted()
                set_footer_font()
                draw_text_bold("Runtime error", 20, 20, WIDTH - 40, 2, bold=False)
                draw_text_bold(type(exc).__name__, 20, 50, WIDTH - 40, 2, bold=False)
                draw_text_bold("Auto restarting...", 20, 80, WIDTH - 40, 2, bold=False)
                graphics.update()
            except Exception:
                pass
            gc.collect()
            safe_sleep(2)


main()
