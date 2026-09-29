"""The 296x128 four-grey e-paper: a city clock face and a meetings list.

A refresh takes a couple of seconds and flashes, and the panel has a
minimum gap between refreshes that CircuitPython enforces, so callers draw
only when what is on screen would change (a new minute, a button).
"""

import time

import board
import displayio
from adafruit_bitmap_font import bitmap_font
from adafruit_display_text import label

from clock import date_line, hhmm

WIDTH, HEIGHT = 296, 128
BLACK, DARK, LIGHT, WHITE = 0x000000, 0x555555, 0xAAAAAA, 0xFFFFFF

FONT_TIME = bitmap_font.load_font("/fonts/Roboto-Black-48.bdf")
FONT_TITLE = bitmap_font.load_font("/fonts/Roboto-Bold-24.bdf")
FONT_SMALL = bitmap_font.load_font("/fonts/Roboto-Medium-16.bdf")
# Only the glyphs the faces use, so the big font loads in seconds, not tens.
FONT_TIME.load_glyphs(b"0123456789:")
FONT_TITLE.load_glyphs(b"ABCDEFGHIJKLMNOPQRSTUVWXYZ ")
FONT_SMALL.load_glyphs(b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:,.-/ ")

display = board.DISPLAY  # 296x128, already landscape in the board definition


def _background():
    bitmap = displayio.Bitmap(WIDTH, HEIGHT, 1)
    palette = displayio.Palette(1)
    palette[0] = WHITE
    return displayio.TileGrid(bitmap, pixel_shader=palette)


def _text(font, text, x, y, color=BLACK, anchor=(0.0, 0.0)):
    t = label.Label(font, text=text, color=color)
    t.anchor_point = anchor
    t.anchored_position = (x, y)
    return t


def _fit(text, font, max_width):
    """Trim with dots until the label fits max_width pixels."""
    if label.Label(font, text=text).bounding_box[2] <= max_width:
        return text
    while len(text) > 1:
        text = text[:-1].rstrip()
        if label.Label(font, text=text + "...").bounding_box[2] <= max_width:
            break
    return text + "..."


def clock_face(city, utc_epoch, next_meeting=None, next_city_offset=None, footer=""):
    """City name and zone on top, HH:MM large, the date, the next meeting."""
    t = city.now(utc_epoch)
    g = displayio.Group()
    g.append(_background())
    g.append(_text(FONT_TITLE, city.name.upper(), 8, 6))
    g.append(_text(FONT_SMALL, city.label(utc_epoch), WIDTH - 8, 10, DARK, anchor=(1.0, 0.0)))
    g.append(_text(FONT_TIME, hhmm(t), WIDTH // 2, 68, anchor=(0.5, 0.5)))
    g.append(_text(FONT_SMALL, date_line(t), 8, HEIGHT - 8, DARK, anchor=(0.0, 1.0)))
    right = footer
    if next_meeting is not None:
        start = time.localtime(next_meeting[0] + (next_city_offset or 0) * 3600)
        right = "Next " + hhmm(start) + " " + _fit(next_meeting[2], FONT_SMALL, 110)
    if right:
        g.append(_text(FONT_SMALL, right, WIDTH - 8, HEIGHT - 8, DARK, anchor=(1.0, 1.0)))
    return g


def meetings_face(city, utc_epoch, meetings, error=None, configured=True):
    """Up to four upcoming meetings in the city's local time."""
    offset = city.offset_hours(utc_epoch)
    g = displayio.Group()
    g.append(_background())
    g.append(_text(FONT_TITLE, "MEETINGS", 8, 6))
    g.append(_text(FONT_SMALL, city.label(utc_epoch) + " " + hhmm(city.now(utc_epoch)), WIDTH - 8, 10, DARK, anchor=(1.0, 0.0)))
    y = 40
    if not configured:
        g.append(_text(FONT_SMALL, "No calendar configured", 8, y, DARK))
    elif not meetings:
        g.append(_text(FONT_SMALL, "Nothing coming up" if not error else "Calendar unreachable", 8, y, DARK))
    for start, end, title in meetings:
        s = time.localtime(start + offset * 3600)
        e = time.localtime(end + offset * 3600)
        when = hhmm(s) + "-" + hhmm(e)
        today = city.now(utc_epoch)
        if (s[0], s[7]) != (today[0], today[7]):
            when += " " + date_line(s)[:3]  # weekday, for a meeting on another day
        g.append(_text(FONT_SMALL, when, 8, y))
        g.append(_text(FONT_SMALL, _fit(title, FONT_SMALL, 160), 128, y))
        y += 21
    return g


def show(group):
    """Put the group up, waiting out the panel's minimum refresh gap."""
    display.root_group = group
    while display.time_to_refresh > 0:
        time.sleep(0.1)
    display.refresh()
