"""Pico Display 2 runtime.

Mirrors Unicorn interaction logic using Pico Display 2 LCD + four buttons.
"""

import time

try:
    import machine
except Exception:
    machine = None

try:
    import picographics
    from picographics import PicoGraphics
except Exception:
    picographics = None
    PicoGraphics = None


BUTTON_COLORS = {
    "A": (255, 0, 0),
    "B": (0, 255, 0),
    "X": (0, 120, 255),
}
IDLE_COLOR = (8, 6, 10)
# Brightest -> dimmest cycling for A/B/X presses.
LEVELS = (1.00, 0.74, 0.52, 0.34, 0.20)
PATTERN_COUNT = 12


def resolve_display2():
    if picographics is None:
        return None
    for name in ("DISPLAY_PICO_DISPLAY_2", "DISPLAY_PICO_DISPLAY", "DISPLAY_PICO_DISPLAY_2_0"):
        value = getattr(picographics, name, None)
        if value is not None:
            return value
    return None


def init_buttons():
    if not machine or not hasattr(machine, "Pin"):
        return None
    try:
        # Pimoroni Pico Display Pack 2 button pins.
        return {
            "A": machine.Pin(12, machine.Pin.IN, machine.Pin.PULL_UP),
            "B": machine.Pin(13, machine.Pin.IN, machine.Pin.PULL_UP),
            "X": machine.Pin(14, machine.Pin.IN, machine.Pin.PULL_UP),
            "Y": machine.Pin(15, machine.Pin.IN, machine.Pin.PULL_UP),
        }
    except Exception:
        return None


def init_backlight():
    if not machine or not hasattr(machine, "Pin"):
        return None
    try:
        # Common Pico Display 2 backlight pin.
        bl = machine.Pin(20, machine.Pin.OUT)
        bl.value(1)
        return bl
    except Exception:
        return None


def fill(gfx, rgb):
    r, gg, b = rgb
    gfx.set_pen(gfx.create_pen(r, gg, b))
    gfx.clear()
    gfx.update()


def scale_rgb(rgb, scale):
    r, gg, b = rgb
    return (int(r * scale), int(gg * scale), int(b * scale))


def startup_sweep(gfx):
    colors = (
        (255, 0, 0),
        (255, 120, 0),
        (255, 255, 0),
        (0, 255, 0),
        (0, 120, 255),
        (140, 0, 255),
    )
    for rgb in colors:
        fill(gfx, rgb)
        time.sleep(0.08)
    fill(gfx, IDLE_COLOR)


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


def draw_pattern(gfx, pattern_index, phase):
    w, h = gfx.get_bounds()
    idx = pattern_index % PATTERN_COUNT

    # Pattern 1: full-screen smooth hue drift with global brightness pulse.
    if idx == 0:
        hue = (phase // 6) % 360
        t = (phase // 12) % 120
        tri = t if t < 60 else (120 - t)
        val = 0.22 + (tri / 60.0) * 0.56
        r, gg, b = hsv_to_rgb(hue, 0.95, min(1.0, val))
        gfx.set_pen(gfx.create_pen(r, gg, b))
        gfx.clear()
        gfx.update()
        return

    # Pattern 12: full-screen stepped palette with slow global fade.
    if idx == (PATTERN_COUNT - 1):
        hue = ((phase // 40) * 60 + 20) % 360
        t = (phase // 14) % 100
        tri = t if t < 50 else (100 - t)
        val = 0.18 + (tri / 50.0) * 0.50
        r, gg, b = hsv_to_rgb(hue, 0.90, min(1.0, val))
        gfx.set_pen(gfx.create_pen(r, gg, b))
        gfx.clear()
        gfx.update()
        return

    # Stripe rendering is much smoother than large blocks and remains responsive.
    use_rect = hasattr(gfx, "rectangle")
    v_step = 2
    h_step = 2

    if idx in (0, 2, 4, 6, 8, 10):
        cols = (w + v_step - 1) // v_step
        for gx in range(cols):
            xx = gx * v_step

            if idx == 0:
                hue = (phase * 3 + gx * 3) % 360
                sat = 1.0
                val = 0.72
            elif idx == 2:
                hue = (phase * 2 + gx * 5 + (gx % 7) * 8) % 360
                sat = 0.95
                val = 0.66 + (0.16 if (gx % 5 == 0) else 0.0)
            elif idx == 4:
                hue = (phase * 4 + gx * 9) % 360
                sat = 1.0
                val = 0.64 if ((gx + phase // 7) % 3) else 0.86
            elif idx == 6:
                hue = (phase * 3 + gx * 4 - (gx % 9) * 6) % 360
                sat = 0.90
                val = 0.68
            elif idx == 8:
                hue = (phase * 5 + gx * 11) % 360
                sat = 1.0
                val = 0.58 if ((gx + phase // 5) % 2) else 0.92
            else:
                # Metallic neon sweep with bright spark lines.
                hue = (phase * 6 + gx * 15 + (gx % 13) * 9) % 360
                sat = 0.88
                val = 0.48 if ((gx + phase // 9) % 6) else 0.98

            r, gg, b = hsv_to_rgb(hue, sat, min(1.0, val))
            gfx.set_pen(gfx.create_pen(r, gg, b))
            if use_rect:
                gfx.rectangle(xx, 0, v_step, h)
            else:
                for yy in range(h):
                    for px in range(xx, min(w, xx + v_step)):
                        gfx.pixel(px, yy)
    else:
        rows = (h + h_step - 1) // h_step

        if idx == 9:
            # Full-screen color hold that shifts hue over time.
            hue = (phase * 3) % 360
            sat = 0.95
            val = 0.78 + (0.16 if ((phase // 18) % 2 == 0) else 0.0)
            r, gg, b = hsv_to_rgb(hue, sat, min(1.0, val))
            gfx.set_pen(gfx.create_pen(r, gg, b))
            gfx.clear()
            gfx.update()
            return

        for gy in range(rows):
            yy = gy * h_step

            if idx == 1:
                hue = (phase * 3 + gy * 4) % 360
                sat = 1.0
                val = 0.70 if ((gy + phase // 8) % 2 == 0) else 0.54
            elif idx == 3:
                center = rows / 2.0
                dist = abs(gy - center)
                hue = (phase * 2 + int(dist * 10) + gy * 2) % 360
                sat = 1.0
                val = max(0.48, 0.92 - dist * 0.015)
            elif idx == 5:
                hue = (phase * 2 + gy * 12) % 360
                sat = 1.0
                val = 0.60 if ((gy + phase // 6) % 4) else 0.90
            elif idx == 7:
                band = (gy + phase // 5) % 6
                hue = (phase * 4 + band * 58) % 360
                sat = 1.0
                val = 0.60 + (0.10 * (band % 3))
            elif idx == 11:
                # Sunset bands drifting over time.
                hue = (15 + phase * 2 + gy * 5 + (gy % 4) * 10) % 360
                sat = 0.92
                val = 0.64 if ((gy + phase // 10) % 3) else 0.90
            else:
                hue = (phase * 3 + gy * 7) % 360
                sat = 0.78
                val = 0.56 + 0.34 * ((gy + 1) / max(1, rows))

            r, gg, b = hsv_to_rgb(hue, sat, min(1.0, val))
            gfx.set_pen(gfx.create_pen(r, gg, b))
            if use_rect:
                gfx.rectangle(0, yy, w, h_step)
            else:
                for xx in range(w):
                    for py in range(yy, min(h, yy + h_step)):
                        gfx.pixel(xx, py)

    gfx.update()


def button_state(buttons):
    if not buttons:
        return {"A": False, "B": False, "X": False, "Y": False}
    return {
        "A": buttons["A"].value() == 0,
        "B": buttons["B"].value() == 0,
        "X": buttons["X"].value() == 0,
        "Y": buttons["Y"].value() == 0,
    }


def pressed_count(state):
    return (1 if state["A"] else 0) + (1 if state["B"] else 0) + (1 if state["X"] else 0) + (1 if state["Y"] else 0)


def main():
    display = resolve_display2()
    if display is None or PicoGraphics is None:
        while True:
            time.sleep(1)

    gfx = PicoGraphics(display=display)
    buttons = init_buttons()
    backlight = init_backlight()

    startup_sweep(gfx)

    prev = button_state(buttons)
    latched_color = ""
    latched_level = 0
    pattern_on = False
    pattern_index = 0
    pattern_phase = 0
    sleeping = False
    prev_two_or_more = False
    last_input_ms = time.ticks_ms()
    latch_idle_timeout_ms = 1500

    while True:
        now = button_state(buttons)
        two_or_more = pressed_count(now) >= 2

        if two_or_more and not prev_two_or_more:
            sleeping = True
            pattern_on = False
            latched_color = ""
            fill(gfx, (0, 0, 0))
            if backlight:
                try:
                    backlight.value(0)
                except Exception:
                    pass

        if sleeping:
            if pressed_count(now) == 0:
                prev = now
                prev_two_or_more = False
                time.sleep(0.05)
                continue

            if pressed_count(now) == 1:
                sleeping = False
                if backlight:
                    try:
                        backlight.value(1)
                    except Exception:
                        pass

                # Apply the wake button action immediately so edges are not lost.
                if now["Y"]:
                    pattern_on = True
                    latched_color = ""
                    draw_pattern(gfx, pattern_index, pattern_phase)
                elif now["A"] or now["B"] or now["X"]:
                    for key in ("A", "B", "X"):
                        if now[key]:
                            pattern_on = False
                            latched_color = key
                            latched_level = 0
                            fill(gfx, scale_rgb(BUTTON_COLORS[key], LEVELS[latched_level]))
                            break
                else:
                    fill(gfx, IDLE_COLOR)

                prev = now
                prev_two_or_more = two_or_more
                time.sleep(0.08)
                continue

            prev = now
            prev_two_or_more = two_or_more
            time.sleep(0.05)
            continue

        if now["Y"] and not prev["Y"]:
            last_input_ms = time.ticks_ms()
            if not pattern_on:
                pattern_on = True
                pattern_index = 0
            else:
                pattern_index = (pattern_index + 1) % PATTERN_COUNT
            latched_color = ""
            draw_pattern(gfx, pattern_index, pattern_phase)

        for key in ("A", "B", "X"):
            if now[key] and not prev[key]:
                last_input_ms = time.ticks_ms()
                pattern_on = False
                if latched_color != key:
                    latched_color = key
                    latched_level = 0
                else:
                    latched_level += 1

                if latched_level >= len(LEVELS):
                    latched_color = ""
                    latched_level = 0
                    fill(gfx, IDLE_COLOR)
                else:
                    fill(gfx, scale_rgb(BUTTON_COLORS[key], LEVELS[latched_level]))

        # Fail-safe: return to idle if latched color is left active with no input.
        if (
            not pattern_on
            and latched_color
            and pressed_count(now) == 0
            and time.ticks_diff(time.ticks_ms(), last_input_ms) > latch_idle_timeout_ms
        ):
            latched_color = ""
            latched_level = 0
            fill(gfx, IDLE_COLOR)

        if pattern_on:
            draw_pattern(gfx, pattern_index, pattern_phase)
            pattern_phase = (pattern_phase + 19) % 360
            time.sleep(0.02)
        else:
            time.sleep(0.05)

        prev = now
        prev_two_or_more = two_or_more


main()
