"""Reset the MagTag from the Mac, without touching its buttons.

Opening the CDC port at 1200 baud makes CircuitPython reboot into the ROM
bootloader (it can take a few seconds); esptool's hard reset then boots it
back into CircuitPython. Useful because the ESP32-S2's USB console can stop
answering after a terminal disconnects while the app runs (2026-09-29, more
than once); the app keeps going, only the console is lost, and this brings it
back. Nothing on the flash is touched.

    python3 reset_board.py
"""
import glob, os, subprocess, sys, time

import serial

ROM_PORT = "/dev/cu.usbmodem01"
app = [p for p in sorted(glob.glob("/dev/cu.usbmodem*")) if p != ROM_PORT]
if app and not os.path.exists(ROM_PORT):
    t = serial.Serial()
    t.port, t.baudrate, t.dtr = app[-1], 1200, False
    t.open(); time.sleep(0.3); t.close()
    print("1200-baud touch sent on", app[-1])
for i in range(90):
    if os.path.exists(ROM_PORT):
        break
    time.sleep(1)
else:
    sys.exit("no ROM bootloader port; press Reset on the board")
subprocess.run(["esptool", "--port", ROM_PORT, "--after", "hard_reset", "chip_id"], capture_output=True)
for i in range(40):
    time.sleep(0.5)
    if os.path.isfile("/Volumes/CIRCUITPY/boot_out.txt") and glob.glob("/dev/cu.usbmodem*"):
        print("CIRCUITPY is back"); break
else:
    sys.exit("board did not come back as CIRCUITPY")
