"""The four NeoPixels: a resting palette, and a flash for alerts.

Brightness stays low. The pixels face the person all day, and at full
brightness four of them draw more than the rest of the board.
"""

import time

import board
import digitalio
import neopixel

# Cute, not loud. Button D steps through these.
PALETTES = (
    ("sakura", ((255, 120, 160), (255, 170, 190), (255, 210, 225), (255, 150, 180))),
    ("mint", ((120, 230, 190), (160, 240, 210), (200, 250, 230), (140, 235, 200))),
    ("sunset", ((255, 140, 60), (255, 100, 90), (220, 80, 140), (255, 170, 80))),
    ("ocean", ((60, 140, 255), (90, 200, 255), (120, 230, 240), (70, 170, 255))),
    ("lavender", ((170, 130, 255), (200, 160, 255), (225, 200, 255), (185, 150, 255))),
    ("off", ((0, 0, 0), (0, 0, 0), (0, 0, 0), (0, 0, 0))),
)

_power = digitalio.DigitalInOut(board.NEOPIXEL_POWER)
_power.direction = digitalio.Direction.OUTPUT
_power.value = False  # active low: powered

_pixels = neopixel.NeoPixel(board.NEOPIXEL, 4, brightness=0.08, auto_write=False)


def set_brightness(value):
    _pixels.brightness = max(0.0, min(1.0, value))


def show_palette(index):
    """Paint the palette at `index` (wrapping) and return its name."""
    name, colours = PALETTES[index % len(PALETTES)]
    for i, colour in enumerate(colours):
        _pixels[i] = colour
    _pixels.show()
    return name


def flash(colour=(255, 255, 255), times=3, on=0.15, off=0.1):
    """Blink all four, then leave them as they were."""
    keep = [_pixels[i] for i in range(4)]
    for _ in range(times):
        _pixels.fill(colour)
        _pixels.show()
        time.sleep(on)
        _pixels.fill((0, 0, 0))
        _pixels.show()
        time.sleep(off)
    for i, c in enumerate(keep):
        _pixels[i] = c
    _pixels.show()
