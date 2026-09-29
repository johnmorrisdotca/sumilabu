"""Make sure the board sees every file the Mac wrote to CIRCUITPY.

macOS's FAT driver and CircuitPython's disagree now and then: a file the Mac
lists at its full size reads as 0 bytes on the board (screen.py, then a
library file, 2026-09-29), and neither sync nor a hard reset fixes it. What
does: delete, write again, unmount and remount. This asks the board for
every file's size over the serial REPL, rewrites the mismatches that way,
and repeats until they agree.

    python3 verify_drive.py [--reload] [--watch SECONDS]
"""
import glob, os, shutil, subprocess, sys, tempfile, time

import serial

DRIVE = os.environ.get("CIRCUITPY", "/Volumes/CIRCUITPY")
PORT_GLOB = os.environ.get("MAGTAG_PORT", "/dev/cu.usbmodem*")


def mac_files():
    out = {}
    for root, dirs, files in os.walk(DRIVE):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "System Volume Information"]
        for f in files:
            if f.startswith(".") or f.startswith("._"):
                continue
            p = os.path.join(root, f)
            out[os.path.relpath(p, DRIVE)] = os.path.getsize(p)
    return out


def open_repl():
    port = sorted(glob.glob(PORT_GLOB))[-1]
    s = serial.Serial(port, 115200, timeout=0.3)
    s.write(b"\x03\x03\r\n")
    time.sleep(0.6)
    s.read(65536)
    return s


def board_sizes(s, paths):
    sizes = {}
    for i in range(0, len(paths), 40):
        chunk = paths[i : i + 40]
        # One line: the REPL auto-indents pasted blocks, so no def/try here.
        s.write(("import os; print('R:', [os.stat('/'+p)[6] if p.rpartition('/')[2] in os.listdir('/'+p.rpartition('/')[0]) else -1 for p in %r])\r\n" % chunk).encode())
        time.sleep(1.5 + 0.02 * len(chunk))
        text = s.read(262144).decode("utf-8", "replace")
        lines = [l for l in text.splitlines() if l.startswith("R:")]
        if not lines:
            sys.exit("no answer from the board; last output:\n" + text[-800:])
        vals = eval(lines[-1][2:].strip())
        sizes.update(zip(chunk, vals))
    return sizes


def flush():
    dev = subprocess.run(["diskutil", "info", DRIVE], capture_output=True, text=True).stdout
    dev = [l.split()[-1] for l in dev.splitlines() if "Device Node" in l][0]
    subprocess.run(["diskutil", "unmount", DRIVE], capture_output=True)
    time.sleep(1)
    subprocess.run(["diskutil", "mount", dev], capture_output=True)
    for _ in range(20):
        if os.path.isdir(DRIVE):
            break
        time.sleep(0.5)
    time.sleep(1)


def rewrite(rel):
    src = os.path.join(DRIVE, rel)
    tmp = tempfile.mktemp()
    shutil.copyfile(src, tmp)
    os.remove(src)
    flush()
    shutil.copyfile(tmp, src)
    os.remove(tmp)


def main():
    reload_after = "--reload" in sys.argv
    watch = int(sys.argv[sys.argv.index("--watch") + 1]) if "--watch" in sys.argv else 0
    for attempt in range(1, 5):
        mac = mac_files()
        paths = sorted(mac)
        s = open_repl()
        board = board_sizes(s, paths)
        s.close()
        bad = [p for p in paths if board.get(p) != mac[p]]
        if not bad:
            print("VERIFY_OK: %d files agree" % len(paths))
            break
        print("attempt %d: %d mismatched: %s" % (attempt, len(bad), ", ".join("%s(board %s, mac %s)" % (p, board.get(p), mac[p]) for p in bad[:8])))
        for p in bad:
            rewrite(p)
        flush()
    else:
        print("VERIFY_FAILED")
        sys.exit(1)
    if reload_after:
        s = open_repl()
        s.write(b"\x04")
        buf = b""
        end = time.time() + watch
        while time.time() < end:
            buf += s.read(4096)
        s.close()
        if watch:
            print("=== console"); print(buf.decode("utf-8", "replace")[-5000:])


main()
