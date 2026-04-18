# SumiLabu Monorepo

This repository contains:

- `firmware/`: MicroPython firmware for InkyFrame 7.3 / 5.7 and Pico Unicorn Pack (device clock/telemetry app)
- `sumilabu-dashboard/`: Next.js + Neon telemetry API/dashboard (Vercel)

The firmware app supports per-device profiles using `secrets.py`:

- `DEVICE_PROFILE="dual"` for local/remote dual clocks (7.3 default)
- `DEVICE_PROFILE="japan"` for a Japan-only full-screen layout (great for 5.7)

And hardware targets:

- `HARDWARE_TARGET="inkyframe"` for InkyFrame 7.3/5.7 devices
- `HARDWARE_TARGET="unicorn-pack"` for Pimoroni Unicorn Pack (4-button Pico)

## 1) Device prerequisites

1. Flash Pimoroni MicroPython firmware for your InkyFrame model (7.3 or 5.7, Pico W).
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

Then edit `firmware/secrets.py` with your Wi-Fi SSID/password and profile settings.

Recommended for your current devices:

- Device 1 (InkyFrame 7.3):
	- `DEVICE_PROFILE = "dual"`
	- `STATS_DEVICE_ID = "inkyframe-office"`
- Device 2 (InkyFrame 5.7):
	- `DEVICE_PROFILE = "japan"`
	- `STATS_DEVICE_ID = "inkyframe-japan-57"`
	- `STATS_PROJECT_KEY = "inkyframe-japan"` (optional but recommended)
	- `ACTIVE_CITY_NAME = "TOKYO"`, `ACTIVE_UTC_OFFSET = 9`

For the new Unicorn Pack device:

- `HARDWARE_TARGET = "unicorn-pack"`
- `STATS_DEVICE_ID = "pico-unicorn-01"`
- `STATS_PROJECT_KEY = "pico-unicorn"` (recommended to keep it separate from inkyframe)

## 4) Push files over USB (safe path)

From repository root:

```bash
./deploy_safe.sh
```

This calls `firmware/deploy_safe.sh`, rebuilds bitmap assets, deploys files, runs probes, and resets the device.

### One-command profile deploy (recommended)

Once your base `firmware/secrets.py` has working Wi-Fi and API credentials, you can deploy either physical device without hand-editing files:

```bash
./deploy_office.sh
```

```bash
./deploy_japan57.sh
```

For Unicorn Pack:

```bash
./deploy_unicorn.sh
```

What these do:

- Generate a temporary profile-specific `firmware/secrets.py`
- Deploy `main.py`, `custom_bitmaps.py`, and `secrets.py`
- Run probe gates and reset the board
- Restore your local `firmware/secrets.py` automatically

Profile defaults:

- `deploy_office.sh` -> `DEVICE_PROFILE="dual"`, `STATS_DEVICE_ID="inkyframe-office"`, `STATS_PROJECT_KEY="inkyframe"`
- `deploy_japan57.sh` -> `DEVICE_PROFILE="japan"`, `STATS_DEVICE_ID="inkyframe-japan-57"`, `STATS_PROJECT_KEY="inkyframe-japan"`, `INKY_DISPLAY="DISPLAY_INKY_FRAME_5_7"`
- `deploy_unicorn.sh` -> `HARDWARE_TARGET="unicorn-pack"`, `DEVICE_PROFILE="dual"`, `STATS_DEVICE_ID="pico-unicorn-01"`, `STATS_PROJECT_KEY="pico-unicorn"`

### Important safety when multiple boards are connected

`firmware/deploy_safe.sh` supports explicit serial targeting via `PORT=`.
When your configured InkyFrame is connected, pass the exact new-device port so you do not overwrite the wrong board.

Example:

```bash
./deploy_unicorn.sh --port /dev/cu.usbmodemXXXXXXX
```

## 5) Verify update

The e-ink screen should show your configured profile:

- `dual`: local + remote clock columns
- `japan`: single, full-screen Japan time/date view

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
- `DEVICE_PROFILE`: profile marker (`dual` or `japan`) included in payload
- `display_model`: auto-detected display constant included in payload
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
