#!/usr/bin/env python3
"""Generate per-device secrets and deploy in one command.

This script preserves your existing firmware/secrets.py by restoring it after deploy.
"""

from __future__ import annotations

import argparse
import ast
import subprocess
import sys
from pathlib import Path
from typing import Any


def parse_assignments(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    tree = ast.parse(text, filename=str(path))
    values: dict[str, Any] = {}

    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name):
            continue
        try:
            values[target.id] = ast.literal_eval(node.value)
        except Exception:
            continue

    return values


def py_literal(value: Any) -> str:
    return repr(value)


def get_value(values: dict[str, Any], key: str, default: Any) -> Any:
    return values.get(key, default)


def build_profile_values(source: dict[str, Any], profile: str) -> dict[str, Any]:
    common = {
        "WIFI_SSID": get_value(source, "WIFI_SSID", ""),
        "WIFI_PASSWORD": get_value(source, "WIFI_PASSWORD", ""),
        "WIFI_COUNTRY": get_value(source, "WIFI_COUNTRY", "CA"),
        "INKY_DISPLAY": get_value(source, "INKY_DISPLAY", "auto"),
        "LOCAL_CITY_NAME": get_value(source, "LOCAL_CITY_NAME", "VANCOUVER"),
        "LOCAL_CITY_NAME_JP": get_value(source, "LOCAL_CITY_NAME_JP", "バンクーバー"),
        "LOCAL_UTC_OFFSET": get_value(source, "LOCAL_UTC_OFFSET", -7),
        "LOCAL_TZ_LABEL": get_value(source, "LOCAL_TZ_LABEL", "PST"),
        "REMOTE_CITY_NAME": get_value(source, "REMOTE_CITY_NAME", "TOKYO"),
        "REMOTE_CITY_NAME_JP": get_value(source, "REMOTE_CITY_NAME_JP", "東京"),
        "REMOTE_UTC_OFFSET": get_value(source, "REMOTE_UTC_OFFSET", 9),
        "REMOTE_TZ_LABEL": get_value(source, "REMOTE_TZ_LABEL", "JST"),
        "STATS_API_URL": get_value(source, "STATS_API_URL", ""),
        "STATS_API_TOKEN": get_value(source, "STATS_API_TOKEN", ""),
        "STATS_INTERVAL_SECONDS": get_value(source, "STATS_INTERVAL_SECONDS", 300),
        "WATCHDOG_TIMEOUT_MS": get_value(source, "WATCHDOG_TIMEOUT_MS", 8388),
        "NTP_RESYNC_SECONDS": get_value(source, "NTP_RESYNC_SECONDS", 0),
    }

    if profile == "office":
        common.update(
            {
                "DEVICE_PROFILE": "dual",
                "STATS_DEVICE_ID": "inkyframe-office",
                "STATS_PROJECT_KEY": "inkyframe",
                "ACTIVE_CITY_NAME": get_value(source, "ACTIVE_CITY_NAME", "TOKYO"),
                "ACTIVE_CITY_NAME_JP": get_value(source, "ACTIVE_CITY_NAME_JP", "東京"),
                "ACTIVE_UTC_OFFSET": get_value(source, "ACTIVE_UTC_OFFSET", 9),
                "ACTIVE_TZ_LABEL": get_value(source, "ACTIVE_TZ_LABEL", "JST"),
            }
        )
        return common

    if profile == "japan57":
        common.update(
            {
                "INKY_DISPLAY": "DISPLAY_INKY_FRAME_5_7",
                "DEVICE_PROFILE": "japan",
                "STATS_DEVICE_ID": "inkyframe-japan-57",
                "STATS_PROJECT_KEY": "inkyframe-japan",
                "ACTIVE_CITY_NAME": "TOKYO",
                "ACTIVE_CITY_NAME_JP": "東京",
                "ACTIVE_UTC_OFFSET": 9,
                "ACTIVE_TZ_LABEL": "JST",
            }
        )
        return common

    raise ValueError(f"Unsupported profile: {profile}")


def render_secrets(values: dict[str, Any], profile: str) -> str:
    lines = [
        "# Auto-generated for deploy profile: {}".format(profile),
        "# Source credentials come from your existing firmware/secrets.py",
        "",
    ]

    keys_in_order = [
        "WIFI_SSID",
        "WIFI_PASSWORD",
        "WIFI_COUNTRY",
        "INKY_DISPLAY",
        "DEVICE_PROFILE",
        "LOCAL_CITY_NAME",
        "LOCAL_CITY_NAME_JP",
        "LOCAL_UTC_OFFSET",
        "LOCAL_TZ_LABEL",
        "REMOTE_CITY_NAME",
        "REMOTE_CITY_NAME_JP",
        "REMOTE_UTC_OFFSET",
        "REMOTE_TZ_LABEL",
        "ACTIVE_CITY_NAME",
        "ACTIVE_CITY_NAME_JP",
        "ACTIVE_UTC_OFFSET",
        "ACTIVE_TZ_LABEL",
        "STATS_API_URL",
        "STATS_API_TOKEN",
        "STATS_PROJECT_KEY",
        "STATS_DEVICE_ID",
        "STATS_INTERVAL_SECONDS",
        "WATCHDOG_TIMEOUT_MS",
        "NTP_RESYNC_SECONDS",
    ]

    for key in keys_in_order:
        if key in values:
            lines.append(f"{key} = {py_literal(values[key])}")

    lines.append("")
    return "\n".join(lines)


def run() -> int:
    parser = argparse.ArgumentParser(description="Deploy a specific InkyFrame device profile")
    parser.add_argument("--profile", choices=["office", "japan57"], required=True)
    args = parser.parse_args()

    script_path = Path(__file__).resolve()
    firmware_dir = script_path.parents[1]
    repo_root = firmware_dir.parent
    secrets_path = firmware_dir / "secrets.py"
    deploy_script = firmware_dir / "deploy_safe.sh"

    if not secrets_path.exists():
        print("Missing firmware/secrets.py. Copy firmware/secrets.py.example first.", file=sys.stderr)
        return 2

    original = secrets_path.read_text(encoding="utf-8")

    try:
        source_values = parse_assignments(secrets_path)
        profile_values = build_profile_values(source_values, args.profile)
        generated = render_secrets(profile_values, args.profile)
        secrets_path.write_text(generated, encoding="utf-8")

        print(f"Deploying profile: {args.profile}")
        print(f"Using device id: {profile_values.get('STATS_DEVICE_ID')}")
        print(f"Using project key: {profile_values.get('STATS_PROJECT_KEY')}")
        subprocess.run([str(deploy_script)], cwd=str(repo_root), check=True)
        return 0
    finally:
        # Restore local working secrets so profile deploys are stateless.
        secrets_path.write_text(original, encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(run())
