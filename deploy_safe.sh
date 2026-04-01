#!/usr/bin/env bash
set -euo pipefail

MIN_FREE_AFTER=100000
PORT="$(find /dev -maxdepth 1 -name 'cu.usbmodem*' | head -n1)"

if [[ -z "${PORT}" ]]; then
  echo "NO_MODEM"
  exit 1
fi

echo "USING=${PORT}"
/Users/john/.local/bin/mpremote connect "${PORT}" fs cp custom_bitmaps.py :custom_bitmaps.py
/Users/john/.local/bin/mpremote connect "${PORT}" fs cp main.py :main.py

ASSET_OUT="$(/Users/john/.local/bin/mpremote connect "${PORT}" run probe_assets.py 2>&1 || true)"
MEM_OUT="$(/Users/john/.local/bin/mpremote connect "${PORT}" run probe_mem.py 2>&1 || true)"

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

FREE_AFTER="$(echo "${MEM_OUT}" | awk '/free_after/{print $2}' | tail -n1)"
if [[ -z "${FREE_AFTER}" ]]; then
  echo "GATE_FAIL_NO_FREE_AFTER"
  exit 23
fi

if (( FREE_AFTER < MIN_FREE_AFTER )); then
  echo "GATE_FAIL_LOW_HEADROOM free_after=${FREE_AFTER} min=${MIN_FREE_AFTER}"
  exit 24
fi

/Users/john/.local/bin/mpremote connect "${PORT}" reset
echo "DEPLOY_GATE_PASS_AND_RESET free_after=${FREE_AFTER}"
