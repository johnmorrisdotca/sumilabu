from __future__ import annotations

from typing import Any

from common.profile_utils import get_value


def build_unicorn_profiles(source: dict[str, Any], common: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, str]]]:
    profiles: dict[str, dict[str, Any]] = {}
    options: dict[str, dict[str, str]] = {}

    unicorn4 = dict(common)
    unicorn4.update(
        {
            "HARDWARE_TARGET": "unicorn-pack",
            "DEVICE_PROFILE": "dual",
            "STATS_DEVICE_ID": "pico-unicorn-01",
            "STATS_PROJECT_KEY": "pico-unicorn",
            "ACTIVE_CITY_NAME": get_value(source, "ACTIVE_CITY_NAME", "TOKYO"),
            "ACTIVE_CITY_NAME_JP": get_value(source, "ACTIVE_CITY_NAME_JP", "東京"),
            "ACTIVE_UTC_OFFSET": get_value(source, "ACTIVE_UTC_OFFSET", 9),
            "ACTIVE_TZ_LABEL": get_value(source, "ACTIVE_TZ_LABEL", "JST"),
        }
    )
    profiles["unicorn4"] = unicorn4
    options["unicorn4"] = {"main_source": "unicorn_main.py"}

    return profiles, options
