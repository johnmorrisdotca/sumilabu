#!/usr/bin/env bash
set -euo pipefail

PORT="/dev/cu.usbmodem3142101"
if [[ ! -e "${PORT}" ]]; then
  echo "NO_EXPECTED_PORT ${PORT}"
  PORT="$(find /dev -maxdepth 1 -name 'cu.usbmodem*' | head -n1 || true)"
fi
if [[ -z "${PORT}" ]]; then
  echo "NO_MODEM"
  exit 1
fi

echo "USING=${PORT}"

for i in {1..80}; do
  echo "TRY_${i}"
  stty -f "${PORT}" 115200 -echo || true
  printf '\x03\x03\x01\x04' > "${PORT}" || true
  sleep 0.4

  if /Users/john/.local/bin/mpremote connect "${PORT}" fs ls >/tmp/ls.out 2>/tmp/ls.err; then
    echo "RAW_OK"

    /Users/john/.local/bin/mpremote connect "${PORT}" fs cp custom_bitmaps.py :custom_bitmaps.py >/tmp/cp1.out 2>/tmp/cp1.err || {
      cat /tmp/cp1.err
      exit 21
    }

    /Users/john/.local/bin/mpremote connect "${PORT}" fs cp main.py :main.py >/tmp/cp2.out 2>/tmp/cp2.err || {
      cat /tmp/cp2.err
      exit 22
    }

    ASSET_OUT="$(/Users/john/.local/bin/mpremote connect "${PORT}" run probe_assets.py 2>&1 || true)"
    MEM_OUT="$(/Users/john/.local/bin/mpremote connect "${PORT}" run probe_mem.py 2>&1 || true)"

    echo '---ASSET_OUT---'
    echo "${ASSET_OUT}"
    echo '---MEM_OUT---'
    echo "${MEM_OUT}"

    if echo "${ASSET_OUT}" | grep -q 'import error'; then
      echo "GATE_FAIL_ASSET"
      exit 31
    fi

    if echo "${MEM_OUT}" | grep -q 'import_error'; then
      echo "GATE_FAIL_MEM"
      exit 32
    fi

    /Users/john/.local/bin/mpremote connect "${PORT}" reset
    echo "DEPLOY_GATE_PASS"
    exit 0
  fi

  tail -n 1 /tmp/ls.err || true
  sleep 0.8
done

echo "DEPLOY_TIMEOUT"
exit 2
