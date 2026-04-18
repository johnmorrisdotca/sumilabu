from __future__ import annotations

from typing import Any

from common.profile_utils import build_common_values
from devices.inkyframe.profiles import build_inkyframe_profiles
from devices.pico_display2.profiles import build_pico_display2_profiles
from devices.unicorn.profiles import build_unicorn_profiles


def build_profile_registry(source: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, str]]]:
    common = build_common_values(source)
    profiles: dict[str, dict[str, Any]] = {}
    options: dict[str, dict[str, str]] = {}

    for builder in (
        build_inkyframe_profiles,
        build_unicorn_profiles,
        build_pico_display2_profiles,
    ):
        p, o = builder(source, common)
        profiles.update(p)
        options.update(o)

    return profiles, options


def all_profiles() -> list[str]:
    # Static list keeps argparse choices deterministic and avoids file reads at import time.
    return [
        "office",
        "japan57",
        "unicorn4",
        "pico_display2",
    ]
