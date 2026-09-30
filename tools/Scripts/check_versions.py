#!/usr/bin/env python3
"""Version-sync gate: package.json, tauri.conf.json, and Cargo.toml/lock must agree.

Usage:
    python tools/Scripts/check_versions.py            # check only (CI-friendly)
    python tools/Scripts/check_versions.py --fix      # rewrite Cargo files to package.json version

Exit code is non-zero on mismatch (without --fix).
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def read_package_version() -> str:
    return json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]


def read_tauri_version() -> str:
    return json.loads((ROOT / "src-tauri" / "tauri.conf.json").read_text(encoding="utf-8"))["version"]


def read_cargo_version() -> str:
    text = (ROOT / "src-tauri" / "Cargo.toml").read_text(encoding="utf-8")
    m = re.search(r'^version\s*=\s*"([^"]+)"', text, re.M)
    assert m, "no version in Cargo.toml"
    return m.group(1)


def main() -> None:
    pkg = read_package_version()
    tauri = read_tauri_version()
    cargo = read_cargo_version()
    print(f"package.json: {pkg} | tauri.conf.json: {tauri} | Cargo.toml: {cargo}")
    if pkg == tauri == cargo:
        print("OK: versions in sync")
        return
    if "--fix" not in sys.argv:
        raise SystemExit(f"version mismatch (package={pkg} tauri={tauri} cargo={cargo}); rerun with --fix")
    cargo_toml = ROOT / "src-tauri" / "Cargo.toml"
    text = cargo_toml.read_text(encoding="utf-8")
    text = re.sub(r'^version\s*=\s*"[^"]+"', f'version = "{pkg}"', text, count=1, flags=re.M)
    cargo_toml.write_text(text, encoding="utf-8")
    cargo_lock = ROOT / "src-tauri" / "Cargo.lock"
    if cargo_lock.is_file():
        lock = cargo_lock.read_text(encoding="utf-8")
        lock = lock.replace(f'name = "anedikit"\nversion = "{cargo}"',
                            f'name = "anedikit"\nversion = "{pkg}"')
        cargo_lock.write_text(lock, encoding="utf-8")
    print(f"fixed Cargo.toml (+lock) to {pkg}")


if __name__ == "__main__":
    main()
