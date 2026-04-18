from __future__ import annotations

from typing import Any

from common.profile_utils import get_value


def build_inkyframe_profiles(source: dict[str, Any], common: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, str]]]:
    profiles: dict[str, dict[str, Any]] = {}
    options: dict[str, dict[str, str]] = {}

    office = dict(common)
    office.update(
        {
            "INKY_DISPLAY": "DISPLAY_INKY_FRAME_7",
            "HARDWARE_TARGET": "inkyframe",
            "DEVICE_PROFILE": "dual",
            "STATS_DEVICE_ID": "inky-maxi",
            "STATS_PROJECT_KEY": "sumilabu-clock",
            "ACTIVE_CITY_NAME": get_value(source, "ACTIVE_CITY_NAME", "TOKYO"),
            "ACTIVE_CITY_NAME_JP": get_value(source, "ACTIVE_CITY_NAME_JP", "東京"),
            "ACTIVE_UTC_OFFSET": get_value(source, "ACTIVE_UTC_OFFSET", 9),
            "ACTIVE_TZ_LABEL": get_value(source, "ACTIVE_TZ_LABEL", "JST"),
        }
    )
    profiles["office"] = office

    japan57 = dict(common)
    japan57.update(
        {
            "INKY_DISPLAY": "DISPLAY_INKY_FRAME_5_7",
            "HARDWARE_TARGET": "inkyframe",
            "DEVICE_PROFILE": "japan",
            "STATS_DEVICE_ID": "inky-mini",
            "STATS_PROJECT_KEY": "sumilabu-clock",
            "ACTIVE_CITY_NAME": "TOKYO",
            "ACTIVE_CITY_NAME_JP": "東京",
            "ACTIVE_UTC_OFFSET": 9,
            "ACTIVE_TZ_LABEL": "JST",
        }
    )
    profiles["japan57"] = japan57

    return profiles, options
