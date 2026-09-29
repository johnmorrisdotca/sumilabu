# MagTag (Adafruit, ESP32-S2, 2.9" four-grey e-paper)

The one CircuitPython device in the fleet. The rest of `firmware/` is
MicroPython for Pimoroni boards; this board has four buttons, four NeoPixels
and a speaker, and Adafruit's CircuitPython libraries drive all of them, so
it runs CircuitPython rather than a MicroPython port with hand-written
drivers.

| | |
|---|---|
| App | `src/code.py` and the modules beside it |
| Config | `settings.toml` (ignored), from `settings.toml.example` |
| Deploy | `../../deploy_magtag.sh` — copies to the mounted `CIRCUITPY` drive |
| Libraries | `circup-requirements.txt`, installed by the deploy script |
| Fonts | `fonts/` Roboto BDFs (Apache 2.0), from Adafruit's Learning System guides |
| Sound | `sounds/coin.wav` — the sound the board shipped with (see below) |
| Firmware | `../uf2/adafruit-circuitpython-adafruit_magtag_2.9_grayscale-en_US-<ver>.{uf2,bin}` |
| Factory app | `factory/MagTag-Factory-Reset*.uf2`, Adafruit's own restore images |

## What it does

- **A** Vancouver clock, **B** Tokyo clock. HH:MM in Roboto, the date, the
  zone label, and the next meeting in the corner. Both are fixed offsets:
  British Columbia has been permanent UTC-7 since 2026-03-09, so there is no
  November edit any more; `LOCAL_DST_RULE = "us"` exists for a city that
  still changes.
- **C** the meetings face: the next four, in the shown city's time. Pressing
  it re-reads the calendar, at most once a minute.
- **D** the next NeoPixel palette (sakura, mint, sunset, ocean, lavender,
  off), kept dim.
- Five minutes before a meeting: the coin sound, a white flash, the
  meetings face for a minute.

The clock face redraws only when the minute changes; the panel flashes on
every refresh and has a minimum gap between them that CircuitPython enforces.

## The sound

The board ships with Adafruit's `shipping_demo` sketch (Arduino, MIT), which
plays a sampled "coin" on button D through the DAC: 13,095 unsigned 8-bit
samples at 16 kHz in its `coin.h`. `sounds/coin.wav` is that array written
out as a WAV (resampled to 11,025 Hz, which the DAC loop in `sounds.py` can
pace; the chirp has nothing above 5 kHz), so `sounds.coin()` plays the same
sound. `audioio` cannot: the ESP32-S2 build lacks the DAC DMA mode it needs.
The original firmware is kept too: `factory/MagTag-Factory-Reset.uf2`
(pre-2025 panel) and `-2025.uf2`, from Adafruit's `Adafruit_MagTag_PCBs`
repository, restore the board to as-shipped by drag-and-drop.

## Meetings

`MEETINGS_URL` is a Sumilabu route that answers the next few meetings as
small JSON (`meetings.py` has the shape). The board polls it no more often
than every 15 minutes and does the five-minute warning itself from the
times it holds, so the warning never depends on a poll landing at the right
moment. With the URL empty the C face says "No calendar configured" and
nothing else changes.

## Installing CircuitPython on a factory board

The factory app has no drive. Either:

- **UF2:** double-click Reset; a `MAGTAGBOOT` drive appears; copy the `.uf2`
  from `../uf2/` onto it. It reboots as `CIRCUITPY`.
- **esptool:** hold Boot0, click Reset (both on the top-left edge). Then,
  from the repo root:

      esptool --port /dev/cu.usbmodem<n> read_flash 0 ALL firmware/magtag/factory/magtag-flash-backup.bin
      esptool --port /dev/cu.usbmodem<n> write_flash 0 firmware/uf2/adafruit-circuitpython-adafruit_magtag_2.9_grayscale-en_US-<ver>.bin

  The first line is a whole-flash backup (bootloader, app, everything), the
  restore path that needs nothing from Adafruit.

A 2025-revision panel needs CircuitPython 10.0.0 or later.

## Watching it, and the console quirk

The ESP32-S2's USB console can stop answering after a terminal disconnects
while the app is running (seen repeatedly on 2026-09-29: no prompt, Ctrl-C
ignored, the app itself fine). `tools/reset_board.py` brings it back without
touching the board: a 1200-baud open makes CircuitPython reboot into the
ROM bootloader, and esptool's hard reset boots it back. Open the console
once, soon after boot, and keep it open, rather than reconnecting.


    /Users/john/.local/pipx/venvs/mpremote/bin/python -c "import serial,sys;s=serial.Serial('/dev/cu.usbmodem<n>',115200,timeout=1)
    while True: sys.stdout.write(s.read(4096).decode('utf-8','replace'))"

Ctrl-C to stop. Or `screen /dev/cu.usbmodem<n> 115200` (`Ctrl-A k` to quit).
