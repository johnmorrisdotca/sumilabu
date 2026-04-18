"""Pico Unicorn Pack runtime.

This is a dedicated Unicorn firmware entrypoint used by deploy_unicorn.sh.
It avoids Inky/Wi-Fi complexity and only handles LED effects + buttons.
"""

import time

from picounicorn import PicoUnicorn
from picographics import PicoGraphics, DISPLAY_UNICORN_PACK

u = PicoUnicorn()
g = PicoGraphics(display=DISPLAY_UNICORN_PACK)

BUTTON_COLORS = {
    "A": (255, 0, 0),
    "B": (0, 255, 0),
    "X": (0, 120, 255),
}
IDLE_COLOR = (8, 6, 10)
LEVELS = (0.14, 0.28, 0.44, 0.62, 0.82)
PATTERN_COUNT = 10


def fill(rgb):
    r, gg, b = rgb
    g.set_pen(g.create_pen(r, gg, b))
    g.clear()
    u.update(g)


def scale_rgb(rgb, scale):
    r, gg, b = rgb
    return (int(r * scale), int(gg * scale), int(b * scale))


def startup_sweep():
    colors = (
        (255, 0, 0),
        (255, 120, 0),
        (255, 255, 0),
        (0, 255, 0),
        (0, 120, 255),
        (140, 0, 255),
    )
    for rgb in colors:
        fill(rgb)
        time.sleep(0.08)
    fill(IDLE_COLOR)


def hsv_to_rgb(h, s=1.0, v=1.0):
    h = float(h % 360)
    s = max(0.0, min(1.0, float(s)))
    v = max(0.0, min(1.0, float(v)))
    c = v * s
    x = c * (1 - abs(((h / 60.0) % 2) - 1))
    m = v - c
    if h < 60:
        rp, gp, bp = c, x, 0
    elif h < 120:
        rp, gp, bp = x, c, 0
    elif h < 180:
        rp, gp, bp = 0, c, x
    elif h < 240:
        rp, gp, bp = 0, x, c
    elif h < 300:
        rp, gp, bp = x, 0, c
    else:
        rp, gp, bp = c, 0, x
    return (
        int((rp + m) * 255),
        int((gp + m) * 255),
        int((bp + m) * 255),
    )


def draw_pattern_frame(phase):
    w = u.get_width()
    h = u.get_height()
    for yy in range(h):
        for xx in range(w):
            hue = (phase + (xx * 18) + (yy * 14)) % 360
            r, gg, b = hsv_to_rgb(hue, 1.0, 0.42)
            g.set_pen(g.create_pen(r, gg, b))
            g.pixel(xx, yy)
    u.update(g)


def draw_pattern(pattern_index, phase):
    w = u.get_width()
    h = u.get_height()
    idx = pattern_index % PATTERN_COUNT

    for yy in range(h):
        for xx in range(w):
            if idx == 0:
                # Meeting standby: vertical zones for red/green/blue with subtle breathing.
                zone = (xx * 3) // max(1, w)
                if zone <= 0:
                    base_hue = 0
                elif zone == 1:
                    base_hue = 120
                else:
                    base_hue = 210
                hue = (base_hue + (yy * 3) + (phase // 8)) % 360
                sat = 0.95
                val = 0.16 + (0.26 * ((phase % 80) / 80.0))
            elif idx == 1:
                hue = (phase * 2 + xx * 26) % 360
                sat = 1.0
                val = 0.45 if (yy + phase // 8) % 2 == 0 else 0.20
            elif idx == 2:
                hue = (phase + yy * 34) % 360
                sat = 0.95
                val = 0.15 + (((xx + phase // 5) % w) / max(1, w - 1)) * 0.55
            elif idx == 3:
                cx = (w - 1) / 2.0
                cy = (h - 1) / 2.0
                dist = abs(xx - cx) + abs(yy - cy)
                hue = (phase * 2 + int(dist * 42)) % 360
                sat = 1.0
                val = max(0.08, 0.52 - dist * 0.08)
            elif idx == 4:
                hue = (phase * 3 + (xx * yy * 9)) % 360
                sat = 1.0
                val = 0.35 + (0.18 if ((xx + yy + phase // 9) % 3 == 0) else 0.0)
            elif idx == 5:
                hue = ((xx * 37) + (yy * 19) + phase) % 360
                sat = 1.0
                val = 0.30 if ((xx + phase // 6) % 4) else 0.62
            elif idx == 6:
                hue = (phase + (xx * 13) - (yy * 31)) % 360
                sat = 0.85
                val = 0.18 + (((yy + phase // 7) % h) / max(1, h - 1)) * 0.52
            elif idx == 7:
                band = (xx + yy + phase // 4) % 6
                hue = (phase * 4 + band * 58) % 360
                sat = 1.0
                val = 0.22 + (0.10 * (band % 3))
            elif idx == 8:
                hue = (phase * 5 + (xx * 51) + (yy * 3)) % 360
                sat = 1.0
                val = 0.48 if ((phase // 3 + xx) % 2 == 0) else 0.10
            else:
                # Calm "aurora" gradient as pattern 9.
                hue = (phase + int((xx / max(1, w - 1)) * 120) + int((yy / max(1, h - 1)) * 70)) % 360
                sat = 0.72
                val = 0.16 + 0.32 * ((yy + 1) / h)

            r, gg, b = hsv_to_rgb(hue, sat, val)
            g.set_pen(g.create_pen(r, gg, b))
            g.pixel(xx, yy)

    u.update(g)


def button_state():
    return {
        "A": bool(u.is_pressed(u.BUTTON_A)),
        "B": bool(u.is_pressed(u.BUTTON_B)),
        "X": bool(u.is_pressed(u.BUTTON_X)),
        "Y": bool(u.is_pressed(u.BUTTON_Y)),
    }


def pressed_count(state):
    return (1 if state["A"] else 0) + (1 if state["B"] else 0) + (1 if state["X"] else 0) + (1 if state["Y"] else 0)


def main():
    startup_sweep()

    prev = button_state()
    latched_color = ""
    latched_level = 0
    pattern_on = False
    pattern_index = 0
    pattern_phase = 0
    sleeping = False
    prev_two_or_more = False

    while True:
        now = button_state()
        two_or_more = pressed_count(now) >= 2

        # Any 2+ buttons held together enters sleep mode.
        if two_or_more and not prev_two_or_more:
            sleeping = True
            pattern_on = False
            latched_color = ""
            fill((0, 0, 0))

        # Sleep behavior: stay black until all buttons released, then any single button wakes.
        if sleeping:
            if pressed_count(now) == 0:
                prev = now
                prev_two_or_more = False
                time.sleep(0.05)
                continue

            if pressed_count(now) == 1:
                sleeping = False
                fill(IDLE_COLOR)
                prev = now
                prev_two_or_more = two_or_more
                time.sleep(0.08)
                continue

            prev = now
            prev_two_or_more = two_or_more
            time.sleep(0.05)
            continue

        # Rising edge on Y enters/cycles pattern mode through 10 variants.
        if now["Y"] and not prev["Y"]:
            if not pattern_on:
                pattern_on = True
                pattern_index = 0
            else:
                pattern_index = (pattern_index + 1) % PATTERN_COUNT
            latched_color = ""
            draw_pattern(pattern_index, pattern_phase)

        # Rising edge on A/B/X cycles color brightness: low -> medium -> high -> idle.
        for key in ("A", "B", "X"):
            if now[key] and not prev[key]:
                pattern_on = False
                if latched_color != key:
                    latched_color = key
                    latched_level = 0
                else:
                    latched_level += 1

                if latched_level >= len(LEVELS):
                    latched_color = ""
                    latched_level = 0
                    fill(IDLE_COLOR)
                else:
                    fill(scale_rgb(BUTTON_COLORS[key], LEVELS[latched_level]))

        if pattern_on:
            draw_pattern(pattern_index, pattern_phase)
            pattern_phase = (pattern_phase + 11) % 360
            time.sleep(0.04)
        else:
            time.sleep(0.05)

        prev = now
        prev_two_or_more = two_or_more


main()
