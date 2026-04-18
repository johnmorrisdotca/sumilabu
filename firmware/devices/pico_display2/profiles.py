from __future__ import annotations

from typing import Any

from common.profile_utils import get_value


def build_pico_display2_profiles(source: dict[str, Any], common: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, str]]]:
    profiles: dict[str, dict[str, Any]] = {}
    options: dict[str, dict[str, str]] = {}

    display2 = dict(common)
    display2.update(
        {
            "HARDWARE_TARGET": "pico-display-2",
            "DEVICE_PROFILE": "dual",
            "STATS_DEVICE_ID": "pico-display2-01",
            "STATS_PROJECT_KEY": "pico-display2",
            "ACTIVE_CITY_NAME": get_value(source, "ACTIVE_CITY_NAME", "TOKYO"),
            "ACTIVE_CITY_NAME_JP": get_value(source, "ACTIVE_CITY_NAME_JP", "東京"),
            "ACTIVE_UTC_OFFSET": get_value(source, "ACTIVE_UTC_OFFSET", 9),
            "ACTIVE_TZ_LABEL": get_value(source, "ACTIVE_TZ_LABEL", "JST"),
        }
    )
    profiles["pico_display2"] = display2
    options["pico_display2"] = {"main_source": "pico_display2_main.py"}

    return profiles, options
