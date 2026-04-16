# SumiLabu Monorepo

This repository contains:

- `firmware/`: MicroPython firmware for InkyFrame 7.3 (device clock app)
- `sumilabu-dashboard/`: Next.js + Neon telemetry API/dashboard (Vercel)

The firmware app renders dual clocks using configurable local/remote city settings from `secrets.py`.

## 1) Device prerequisites

1. Flash Pimoroni MicroPython firmware for InkyFrame 7.3 (Pico W).
2. Connect the board to your Mac over USB.
3. Ensure the board appears to `mpremote` as a USB serial device.

## 2) Install deployment tool on macOS

```bash
python3 -m pip install --user mpremote
```

If `mpremote` is not on your PATH, use:

```bash
python3 -m mpremote --help
```

## 3) Configure Wi-Fi credentials

Create `firmware/secrets.py` from the template:

```bash
cp firmware/secrets.py.example firmware/secrets.py
```

Then edit `firmware/secrets.py` with your Wi-Fi SSID/password and locality settings.

## 4) Push files over USB (safe path)

From repository root:

```bash
./deploy_safe.sh
```

This calls `firmware/deploy_safe.sh`, rebuilds bitmap assets, deploys files, runs probes, and resets the device.

## 5) Verify update

The e-ink screen should show:
- Title: "InkyFrame 7.3 - Time MVP"
- Vancouver (Pacific Time)
- Japan (JST)

## Notes

- No battery required for development over USB.
- microSD is not required for this MVP.
- If Wi-Fi/NTP fails, the app still renders using current RTC time.

## Optional: SumiLabu Device Telemetry API (multi-device dashboard)

You can enable periodic stats POSTs so multiple devices/projects report into one backend/UI.

Set in `firmware/secrets.py`:

- `STATS_API_URL`: API endpoint (empty disables telemetry)
- `STATS_API_TOKEN`: optional bearer token
- `STATS_DEVICE_ID`: unique ID per device (for grouping in your GUI)
- `STATS_INTERVAL_SECONDS`: heartbeat interval (default `300`)

Events sent:

- `boot`
- `mode_change`
- `refresh`
- `heartbeat`

JSON fields include:

- `device_id`, `app_version`, `event`, `mode`
- `ntp_ok`, `bitmap_assets_ok`
- `mem_free`, `mem_alloc`, `uptime_s`, `unix_ts`
- `wifi`, `sync`

Recommended backend shape for your GUI:

- Table key: `(device_id, unix_ts)`
- Latest-by-device card: sort by `unix_ts desc`
- Alert if no heartbeat from a device for > 2x interval

## Next step ideas

- Pull upcoming meetings from a small JSON feed.
- Add overlap-time suggestions between PST and JST.
- Add a button-triggered immediate refresh.
