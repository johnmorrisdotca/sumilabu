"""E-ink display scrub — clears ghosting by cycling full black/white frames.

Run this on the device via mpremote to clear ghost images.
Pass the display type as argv: 57 or 73.
"""

import gc
import sys
import time

gc.collect()

import picographics  # type: ignore[import-not-found]
from picographics import PicoGraphics  # type: ignore[import-not-found]

# Determine display from argv
arg = sys.argv[1] if len(sys.argv) > 1 else "57"

if arg == "73":
    VARIANTS = ("DISPLAY_INKY_FRAME_7", "DISPLAY_INKY_FRAME_7_3")
else:
    VARIANTS = ("DISPLAY_INKY_FRAME_5_7", "DISPLAY_INKY_FRAME_5", "DISPLAY_INKY_FRAME")

display_const = None
for name in VARIANTS:
    display_const = getattr(picographics, name, None)
    if display_const is not None:
        print("Using display constant: {} = {}".format(name, display_const))
        break

if display_const is None:
    # Fallback: list all available constants
    all_consts = [a for a in dir(picographics) if a.startswith("DISPLAY_INKY")]
    raise RuntimeError("No display constant found. Available: {}".format(all_consts))

graphics = PicoGraphics(display_const)

# Use highest quality (slowest) update for best clearing
try:
    graphics.set_update_speed(0)
except Exception:
    pass

WIDTH, HEIGHT = graphics.get_bounds()
print("Display bounds: {}x{}".format(WIDTH, HEIGHT))

BLACK = 0
WHITE = 15

# Try to find usable pen values
try:
    BLACK_PEN = graphics.create_pen(0, 0, 0)
except Exception:
    BLACK_PEN = 0

try:
    WHITE_PEN = graphics.create_pen(255, 255, 255)
except Exception:
    WHITE_PEN = 15

CYCLES = 5
print("Running {} black/white scrub cycles...".format(CYCLES))

for cycle in range(CYCLES):
    # Full black
    graphics.set_pen(BLACK_PEN)
    graphics.rectangle(0, 0, WIDTH, HEIGHT)
    print("  Cycle {}/{}: updating black...".format(cycle + 1, CYCLES))
    graphics.update()
    time.sleep(1)

    # Full white
    graphics.set_pen(WHITE_PEN)
    graphics.rectangle(0, 0, WIDTH, HEIGHT)
    print("  Cycle {}/{}: updating white...".format(cycle + 1, CYCLES))
    graphics.update()
    time.sleep(1)

print("Scrub complete!")
print("Flash clean on LED A, then deep sleep.")

# Signal completion via LED if available
try:
    import inky_frame  # type: ignore[import-not-found]
    inky_frame.led_busy.off()
    inky_frame.led_wifi.off()
    for _ in range(6):
        inky_frame.led_a.toggle()
        time.sleep(0.3)
    inky_frame.led_a.off()
except Exception:
    pass

# Go to deep sleep so the device stops; user can reconnect USB to re-flash
try:
    import inky_frame
    inky_frame.sleep_for(1)
except Exception:
    pass
