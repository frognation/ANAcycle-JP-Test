#!/usr/bin/env python3
"""Restore workspace files from VS Code Local History snapshots.

This is useful when you want to roll back to an earlier editor state without Git commits.

Safety:
- It overwrites files in-place. Always keep a backup (e.g., `git stash -u`) before running.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
from pathlib import Path
import sys
import urllib.parse


def _parse_cutoff(value: str) -> _dt.datetime:
    """Parse cutoff as local time.

    Accepts:
    - YYYY-MM-DD HH:MM
    - YYYY-MM-DDTHH:MM
    - YYYY-MM-DD HH:MM:SS
    """

    value = value.strip()
    fmts = [
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ]
    for fmt in fmts:
        try:
            return _dt.datetime.strptime(value, fmt)
        except ValueError:
            pass
    raise SystemExit(f"Invalid --cutoff format: {value!r}. Try '2026-01-12 08:00'.")


def _history_roots() -> list[Path]:
    home = Path.home()
    roots = [
        home / "Library/Application Support/Code/User/History",
        home / "Library/Application Support/Code - Insiders/User/History",
    ]
    return [r for r in roots if r.is_dir()]


def _resource_to_path(resource: str) -> Path | None:
    if not resource.startswith("file:///"):
        return None
    # resource is like file:///Users/name/path/to/file
    decoded = urllib.parse.unquote(resource[len("file://"):])
    return Path(decoded)


def _iter_entries(history_root: Path, repo_root: Path):
    for entry_file in history_root.rglob("entries.json"):
        try:
            data = json.loads(entry_file.read_text(encoding="utf-8"))
        except Exception:
            continue

        resource = data.get("resource")
        if not isinstance(resource, str):
            continue

        path = _resource_to_path(resource)
        if path is None:
            continue

        try:
            path = path.resolve()
        except FileNotFoundError:
            # Resource may have been deleted; still ok.
            path = Path(os.path.realpath(path))

        if repo_root not in path.parents:
            continue

        entries = data.get("entries")
        if not isinstance(entries, list):
            continue

        for e in entries:
            if not isinstance(e, dict):
                continue
            ts = e.get("timestamp")
            snap_id = e.get("id")
            if isinstance(ts, int) and isinstance(snap_id, str):
                yield path, ts, snap_id, entry_file.parent


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Restore files from VS Code Local History")
    parser.add_argument(
        "--repo",
        default=str(Path.cwd()),
        help="Repository/workspace root path (default: current working directory)",
    )
    parser.add_argument(
        "--cutoff",
        required=True,
        help="Restore to latest snapshot at/before this local time (e.g., '2026-01-12 08:00')",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be restored without writing files",
    )
    parser.add_argument(
        "--report",
        default=None,
        help="Optional report file path (default: ./restore-local-history-report-YYYYMMDD-HHMMSS.json)",
    )

    args = parser.parse_args(argv)

    repo_root = Path(args.repo).expanduser().resolve()
    cutoff_dt = _parse_cutoff(args.cutoff)
    cutoff_ms = int(cutoff_dt.timestamp() * 1000)

    roots = _history_roots()
    if not roots:
        raise SystemExit("No VS Code Local History folders found.")

    # Map: file path -> best snapshot (ts, id, folder)
    best: dict[Path, tuple[int, str, Path]] = {}

    for root in roots:
        for path, ts, snap_id, folder in _iter_entries(root, repo_root):
            if ts > cutoff_ms:
                continue
            cur = best.get(path)
            if cur is None or ts > cur[0]:
                best[path] = (ts, snap_id, folder)

    restored = []
    missing_snapshot_file = []

    for path in sorted(best.keys()):
        ts, snap_id, folder = best[path]
        snap_path = folder / snap_id
        if not snap_path.exists():
            missing_snapshot_file.append(
                {
                    "file": str(path),
                    "snapshotId": snap_id,
                    "snapshotPath": str(snap_path),
                    "timestamp": ts,
                }
            )
            continue

        rel = path.relative_to(repo_root)
        if args.dry_run:
            restored.append({"file": str(rel), "timestamp": ts, "snapshotId": snap_id})
            continue

        path.parent.mkdir(parents=True, exist_ok=True)
        content = snap_path.read_bytes()
        path.write_bytes(content)
        restored.append({"file": str(rel), "timestamp": ts, "snapshotId": snap_id})

    report = {
        "repo": str(repo_root),
        "cutoff": cutoff_dt.isoformat(sep=" "),
        "cutoffMs": cutoff_ms,
        "historyRoots": [str(r) for r in roots],
        "restoredCount": len(restored),
        "missingSnapshotFileCount": len(missing_snapshot_file),
        "restored": restored,
        "missingSnapshotFiles": missing_snapshot_file,
    }

    if args.report:
        report_path = Path(args.report).expanduser()
    else:
        stamp = _dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        report_path = repo_root / f"restore-local-history-report-{stamp}.json"

    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Cutoff (local): {cutoff_dt}")
    print(f"Found restore points: {len(best)}")
    print(f"Restored files: {len(restored)}{' (dry-run)' if args.dry_run else ''}")
    if missing_snapshot_file:
        print(f"Warning: Missing snapshot files: {len(missing_snapshot_file)} (see report)")
    print(f"Report: {report_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
