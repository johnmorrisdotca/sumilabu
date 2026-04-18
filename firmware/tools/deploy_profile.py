#!/usr/bin/env python3
"""Generate per-device secrets and deploy in one command.

This script preserves your existing firmware/secrets.py by restoring it after deploy.
"""

from __future__ import annotations

import argparse
import ast
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).resolve()
FIRMWARE_DIR = SCRIPT_PATH.parents[1]
if str(FIRMWARE_DIR) not in sys.path:
    sys.path.insert(0, str(FIRMWARE_DIR))

from common.profile_utils import render_secrets
from deploy.profile_registry import all_profiles, build_profile_registry


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


def run() -> int:
    parser = argparse.ArgumentParser(description="Deploy a specific device profile")
    parser.add_argument("--profile", choices=all_profiles(), required=True)
    parser.add_argument(
        "--port",
        default="",
        help="Optional serial port override passed to deploy_safe.sh (recommended when multiple boards are connected)",
    )
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
        profiles, profile_options = build_profile_registry(source_values)
        if args.profile not in profiles:
            raise ValueError(f"Unsupported profile: {args.profile}")

        profile_values = profiles[args.profile]
        generated = render_secrets(profile_values, args.profile)
        secrets_path.write_text(generated, encoding="utf-8")

        print(f"Deploying profile: {args.profile}")
        print(f"Using device id: {profile_values.get('STATS_DEVICE_ID')}")
        print(f"Using project key: {profile_values.get('STATS_PROJECT_KEY')}")

        env = dict(os.environ)
        # Precompile .mpy to reduce RAM usage on all InkyFrame devices.
        env["MPY_COMPILE"] = "true"
        profile_env = profile_options.get(args.profile, {})
        if "main_source" in profile_env:
            env["MAIN_SOURCE"] = profile_env["main_source"]
        if args.port:
            env["PORT"] = args.port

        subprocess.run([str(deploy_script)], cwd=str(repo_root), check=True, env=env)
        return 0
    finally:
        # Restore local working secrets so profile deploys are stateless.
        secrets_path.write_text(original, encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(run())
