#!/usr/bin/env bash
# Deploy the MagTag app to a board running CircuitPython.
#
# The board mounts as a drive (CIRCUITPY); CircuitPython restarts the app
# when code.py changes, so a deploy is a copy. Libraries come from circup,
# which resolves each one's dependencies from the Adafruit bundle.
#
#   ./deploy_magtag.sh            # libs (if missing), app, fonts, sounds, settings
#   ./deploy_magtag.sh --libs     # also upgrade every library to the bundle's version
set -euo pipefail
# macOS writes a ._sidecar beside every file on a FAT drive; the board has 960 KB.
export COPYFILE_DISABLE=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${ROOT}/firmware/magtag"
DRIVE="${CIRCUITPY:-/Volumes/CIRCUITPY}"

if [[ ! -d "${DRIVE}" ]]; then
  echo "NO_CIRCUITPY: ${DRIVE} is not mounted."
  echo "  Factory board? Flash CircuitPython first: firmware/magtag/README.md."
  exit 1
fi
if [[ ! -f "${SRC}/settings.toml" ]]; then
  echo "NO_SETTINGS: copy ${SRC}/settings.toml.example to settings.toml and fill it in."
  exit 1
fi
command -v circup >/dev/null || { echo "NO_CIRCUP (pipx install circup)"; exit 1; }

echo "== libraries"
if [[ "${1:-}" == "--libs" ]]; then
  circup --path "${DRIVE}" update --all
fi
circup --path "${DRIVE}" install -r "${SRC}/circup-requirements.txt"

echo "== app"
find "${DRIVE}" -name "._*" -delete 2>/dev/null || true
mkdir -p "${DRIVE}/fonts" "${DRIVE}/sounds"
cp "${SRC}"/fonts/*.bdf "${DRIVE}/fonts/"
cp "${SRC}"/sounds/*.wav "${DRIVE}/sounds/"
cp "${SRC}/settings.toml" "${DRIVE}/settings.toml"
cp "${SRC}"/src/*.py "${DRIVE}/"
find "${DRIVE}" -name "._*" -delete 2>/dev/null || true
sync

# macOS's FAT driver and the board's disagree now and then: a file the Mac
# lists at full size reads as 0 bytes on the board, and neither sync nor a
# reset fixes it (2026-09-29, screen.py and a library file). The verifier
# asks the board for every file's size over the REPL, rewrites and flushes
# the mismatches, then reloads the app and tails the console.
echo "== verify"
PY=""
for candidate in "${ROOT}/.venv-tools/bin/python" "/Users/john/.local/pipx/venvs/mpremote/bin/python" python3; do
  if "${candidate}" -c "import serial" >/dev/null 2>&1; then PY="${candidate}"; break; fi
done
[[ -n "${PY}" ]] || { echo "NO_PYSERIAL (pipx inject mpremote pyserial, or pip install pyserial in .venv-tools)"; exit 1; }
"${PY}" "${SRC}/tools/verify_drive.py" --reload --watch "${WATCH_SECONDS:-60}"
echo "MAGTAG_DEPLOY_DONE"
