#!/usr/bin/env python3
"""Vendor drift gate for src/vendor/ (Tauri serves these directly).

Reality this encodes (verified 2026-09-20):
- bootstrap.min.css: byte-identical to node_modules -> SYNCED (copy on --sync).
- bootstrap.bundle.min.js: HAND-PATCHED modal-timing fix, differs from npm by
  design -> PINNED (hash must match; never overwritten without --force).
- ionicons/: hand-picked subset snapshot, not mirroring node_modules layout ->
  PINNED as a tree digest (drift detection only).
- bootstrap-icons/: no npm dependency provides it -> PINNED as a tree digest.

Usage:
    python tools/Scripts/sync_vendor.py            # check only (CI-friendly)
    python tools/Scripts/sync_vendor.py --sync     # copy synced files from npm
    python tools/Scripts/sync_vendor.py --repin    # re-record pins after a
                                                   # deliberate vendor change

Exit code is non-zero on unexpected drift.
"""
import hashlib
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
VENDOR = ROOT / "src" / "vendor"
NM = ROOT / "node_modules"

SYNCED = [
    ("bootstrap/dist/css/bootstrap.min.css", "bootstrap/bootstrap.min.css"),
]

# sha256 pins (refresh with --repin after deliberate vendor edits)
PINS = {
    "bootstrap/bootstrap.bundle.min.js":
        "fefeba990a0e4e1c2e5537321c20861083693f992fdd0652c55d1a723da42803",
    "tree:ionicons":
        "26c88a17bacedc1971d704c38f3eda30607eff7796c1cb6e6889658411f71af2",
    "tree:bootstrap-icons":
        "27620e50b865e86d7d36d01244c784fb99a390ea32aa3cc9d1fa56bc9d7bf193",
}


def sha_file(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha_tree(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    for f in sorted(path.rglob("*")):
        if f.is_file():
            h.update(f.relative_to(path).as_posix().encode())
            h.update(f.read_bytes())
    return h.hexdigest()


def pin_value(key: str) -> str:
    if key.startswith("tree:"):
        return sha_tree(VENDOR / key[len("tree:"):])
    return sha_file(VENDOR / key)


def main() -> None:
    mode = "--sync" if "--sync" in sys.argv else ("--repin" if "--repin" in sys.argv else "--check")
    problems = []

    for npm_rel, vendor_rel in SYNCED:
        src, dst = NM / npm_rel, VENDOR / vendor_rel
        if not src.is_file():
            problems.append(f"npm source missing: {npm_rel} (run npm install?)")
            continue
        if not dst.is_file() or sha_file(src) != sha_file(dst):
            if mode == "--sync":
                shutil.copyfile(src, dst)
                print(f"synced {vendor_rel} from node_modules ({src.stat().st_size} bytes)")
            else:
                problems.append(f"drift: {vendor_rel} differs from node_modules")
        else:
            print(f"OK synced: {vendor_rel}")

    for key, pinned in PINS.items():
        current = pin_value(key)
        if current == pinned:
            print(f"OK pinned: {key}")
        elif mode == "--repin":
            print(f"re-pinned {key}: {current}")
        else:
            problems.append(f"drift: pinned {key} changed (was {pinned[:12]}…, now {current[:12]}…)")

    if mode == "--repin":
        print("repin complete — update the PINS dict in this script with the values above")
        return

    if problems:
        print("\n".join(f"FAIL: {p}" for p in problems))
        raise SystemExit(f"vendor drift detected ({len(problems)} issue(s))")
    print("OK: vendor tree matches manifest")


if __name__ == "__main__":
    main()
