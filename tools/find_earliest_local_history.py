#!/usr/bin/env python3
"""Find earliest VS Code Local History timestamp for given files.

Prints one line: YYYY-MM-DD HH:MM:SS (local time)

Exit codes:
- 0: found
- 2: no history found for provided files
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
import urllib.parse


def _history_root() -> Path:
    root = Path.home() / "Library/Application Support/Code/User/History"
    if not root.is_dir():
        raise SystemExit("VS Code Local History folder not found: " + str(root))
    return root


def _res_to_path(res: str) -> Path | None:
    if not res.startswith("file:///"):
        return None
    decoded = urllib.parse.unquote(res[len("file://"):])
    return Path(decoded)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=str(Path.cwd()), help="Repo/workspace root")
    ap.add_argument("files", nargs="+", help="File paths (relative to repo or absolute)")
    args = ap.parse_args()

    repo = Path(args.repo).expanduser().resolve()
    targets = []
    for f in args.files:
        p = Path(f).expanduser()
        if not p.is_absolute():
            p = (repo / p)
        try:
            p = p.resolve()
        except Exception:
            pass
        targets.append(p)

    targets_set = set(targets)
    hroot = _history_root()

    earliest_ms: int | None = None

    for ep in hroot.rglob("entries.json"):
        try:
            data = json.loads(ep.read_text(encoding="utf-8"))
        except Exception:
            continue
        res = data.get("resource")
        if not isinstance(res, str):
            continue
        p = _res_to_path(res)
        if p is None:
            continue
        try:
            p = p.resolve()
        except Exception:
            pass
        if p not in targets_set:
            continue
        for e in data.get("entries") or []:
            if not isinstance(e, dict):
                continue
            ts = e.get("timestamp")
            if isinstance(ts, int):
                if earliest_ms is None or ts < earliest_ms:
                    earliest_ms = ts

    if earliest_ms is None:
        return 2

    t = dt.datetime.fromtimestamp(earliest_ms / 1000.0)
    print(t.strftime("%Y-%m-%d %H:%M:%S"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
