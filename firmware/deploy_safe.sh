#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${SCRIPT_DIR}"

MIN_FREE_AFTER=100000
MPY_COMPILE="${MPY_COMPILE:-false}"
PY_BIN="${REPO_ROOT}/.venv-tools/bin/python"
if [[ ! -x "${PY_BIN}" ]]; then
  PY_BIN="python3"
fi

MPY_CROSS="${REPO_ROOT}/.venv-tools/bin/mpy-cross"
if [[ "${MPY_COMPILE}" == "true" ]] && ! command -v "${MPY_CROSS}" >/dev/null 2>&1; then
  echo "MPY_CROSS_MISSING (install with: ${PY_BIN} -m pip install mpy-cross)"
  exit 1
fi

if command -v mpremote >/dev/null 2>&1; then
  MPREMOTE=("$(command -v mpremote)")
elif "${PY_BIN}" -m mpremote --help >/dev/null 2>&1; then
  MPREMOTE=("${PY_BIN}" -m mpremote)
else
  echo "NO_MPREMOTE (install with: ${PY_BIN} -m pip install mpremote)"
  exit 1
fi

echo "BUILD_BITMAPS_WITH=${PY_BIN}"
echo "MPREMOTE_CMD=${MPREMOTE[*]}"
"${PY_BIN}" tools/generate_custom_bitmaps.py

if [[ -n "${PORT:-}" ]]; then
  echo "PORT_OVERRIDE=${PORT}"
else
  PORT="$(find /dev -maxdepth 1 -name 'cu.usbmodem*' | head -n1)"
fi

if [[ -z "${PORT}" ]]; then
  echo "NO_MODEM"
  exit 1
fi

if [[ ! -f "secrets.py" ]]; then
  echo "MISSING_SECRETS (create firmware/secrets.py first)"
  exit 2
fi

echo "USING=${PORT}"

if [[ "${MPY_COMPILE}" == "true" ]]; then
  echo "MPY_COMPILE=true — precompiling .py → .mpy"
  "${MPY_CROSS}" custom_bitmaps.py -o custom_bitmaps.mpy
  "${MPY_CROSS}" main.py -o _main.mpy
  # Remove stale files; keep a stub main.py that boots _main.mpy
  "${MPREMOTE[@]}" connect "${PORT}" exec "
import os
for f in ['main.py','main.mpy','_main.py','custom_bitmaps.py']:
    try: os.remove(f)
    except: pass
"
  "${MPREMOTE[@]}" connect "${PORT}" fs cp custom_bitmaps.mpy :custom_bitmaps.mpy
  "${MPREMOTE[@]}" connect "${PORT}" fs cp _main.mpy :_main.mpy
  # Stub main.py so MicroPython auto-executes on boot
  "${MPREMOTE[@]}" connect "${PORT}" exec "
f = open('main.py', 'w')
f.write('import _main\n')
f.close()
print('wrote main.py stub')
"
  MIN_FREE_AFTER=20000
else
  "${MPREMOTE[@]}" connect "${PORT}" fs cp custom_bitmaps.py :custom_bitmaps.py
  "${MPREMOTE[@]}" connect "${PORT}" fs cp main.py :main.py
fi
"${MPREMOTE[@]}" connect "${PORT}" fs cp secrets.py :secrets.py

ASSET_OUT="$("${MPREMOTE[@]}" connect "${PORT}" run probe_assets.py 2>&1 || true)"
MEM_OUT="$("${MPREMOTE[@]}" connect "${PORT}" run probe_mem.py 2>&1 || true)"

echo "---PROBE_ASSETS---"
echo "${ASSET_OUT}"
echo "---PROBE_MEM---"
echo "${MEM_OUT}"

if echo "${ASSET_OUT}" | grep -q "import error"; then
  echo "GATE_FAIL_ASSET"
  exit 21
fi

if echo "${MEM_OUT}" | grep -q "import_error"; then
  echo "GATE_FAIL_MEM"
  exit 22
fi

FREE_AFTER="$(echo "${MEM_OUT}" | awk '/free_after/{print $2}' | tail -n1 | tr -d '[:space:]')"
if [[ -z "${FREE_AFTER}" ]]; then
  echo "GATE_FAIL_NO_FREE_AFTER"
  exit 23
fi

if (( FREE_AFTER < MIN_FREE_AFTER )); then
  echo "GATE_FAIL_LOW_HEADROOM free_after=${FREE_AFTER} min=${MIN_FREE_AFTER}"
  exit 24
fi

"${MPREMOTE[@]}" connect "${PORT}" reset
echo "DEPLOY_GATE_PASS_AND_RESET free_after=${FREE_AFTER}"
