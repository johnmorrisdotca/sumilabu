from __future__ import annotations

from typing import Any


def get_value(values: dict[str, Any], key: str, default: Any) -> Any:
    return values.get(key, default)


def build_common_values(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "WIFI_SSID": get_value(source, "WIFI_SSID", ""),
        "WIFI_PASSWORD": get_value(source, "WIFI_PASSWORD", ""),
        "WIFI_COUNTRY": get_value(source, "WIFI_COUNTRY", "CA"),
        "INKY_DISPLAY": get_value(source, "INKY_DISPLAY", "auto"),
        "HARDWARE_TARGET": get_value(source, "HARDWARE_TARGET", "auto"),
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
        "STATS_HTTP_TIMEOUT_S": get_value(source, "STATS_HTTP_TIMEOUT_S", 8),
        "WATCHDOG_TIMEOUT_MS": get_value(source, "WATCHDOG_TIMEOUT_MS", 8388),
        "ENABLE_WATCHDOG": False,
        "ENABLE_AUTO_RECOVER_RESET": False,
        "NTP_RESYNC_SECONDS": get_value(source, "NTP_RESYNC_SECONDS", 0),
    }


def py_literal(value: Any) -> str:
    return repr(value)


SECRETS_KEYS_IN_ORDER = [
    "WIFI_SSID",
    "WIFI_PASSWORD",
    "WIFI_COUNTRY",
    "INKY_DISPLAY",
    "HARDWARE_TARGET",
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
    "STATS_HTTP_TIMEOUT_S",
    "ENABLE_WATCHDOG",
    "ENABLE_AUTO_RECOVER_RESET",
    "WATCHDOG_TIMEOUT_MS",
    "NTP_RESYNC_SECONDS",
]


def render_secrets(values: dict[str, Any], profile: str) -> str:
    lines = [
        "# Auto-generated for deploy profile: {}".format(profile),
        "# Source credentials come from your existing firmware/secrets.py",
        "",
    ]

    for key in SECRETS_KEYS_IN_ORDER:
        if key in values:
            lines.append(f"{key} = {py_literal(values[key])}")

    lines.append("")
    return "\n".join(lines)
