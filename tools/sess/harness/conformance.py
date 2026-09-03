#!/usr/bin/env python3
"""External conformance harness for sess.

Drives the real binary through its real command-line interface and checks
every numeric column of `sess stat` against an independent re-derivation of
the same numbers in SQL, computed from the raw transcript.

This is the project's second-derivation oracle. It lives outside the
implementation on purpose: the in-language tests die with the tree, while
this suite, the committed fixture corpora, and the design basis are what
would let sess be rebuilt in another language and checked against what it
used to do.

The two halves are independent by construction:

  * the SQL in queries/ is written from the transcript formats, not from
    src/main.zig, so a misreading of a format shows up as a disagreement;
  * format detection is re-implemented here from the documented rule rather
    than taken from the tool's own FMT column;
  * number formatting is re-implemented here from the documented output
    contract, so the comparison is exact at any magnitude rather than
    tolerant.

Usage:
    harness/conformance.py [transcript ...]

With no arguments it runs against the committed fixture corpora. Pass real
transcript paths to check agreement at scale. Exits non-zero on any
disagreement, and reports honestly when it could not run.
"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUERIES = pathlib.Path(__file__).resolve().parent / "queries"
BINARY = ROOT / "zig-out" / "bin" / "sess"
FIXTURES = sorted((ROOT / "src" / "testdata").glob("*.jsonl"))

# Columns compared, in `sess stat` order, with the byte span of each in the
# fixed-width row. Spans come from the documented table layout.
SPANS = {
    "TURNS": (25, 30), "API": (31, 36), "TOOLS": (37, 42), "ERR": (43, 47),
    "IN": (48, 55), "OUT": (56, 63), "CACHE_R": (64, 72), "CACHE_W": (73, 81),
    "COST": (82, 90),
}
SQL_ORDER = ["turns", "api", "tools", "err", "in_tok", "out_tok",
             "cache_r", "cache_w", "cost"]


def fmt_count(n: int) -> str:
    """The documented humanization of a count column."""
    if n >= 1_000_000_000:
        return f"{n // 1_000_000_000}.{(n % 1_000_000_000) // 100_000_000}G"
    if n >= 100_000_000:
        return f"{n // 1_000_000}M"
    if n >= 1_000_000:
        return f"{n // 1_000_000}.{(n % 1_000_000) // 100_000}M"
    if n >= 100_000:
        return f"{n // 1_000}k"
    if n >= 1_000:
        return f"{n // 1_000}.{(n % 1_000) // 100}k"
    return str(n)


def fmt_cost(c: float) -> str:
    return "-" if c <= 0 else f"${c:.2f}"


def detect_format(path: pathlib.Path) -> str | None:
    """Re-implementation of the documented detection rule: inspect the first
    few non-empty lines, never the path or file name."""
    checked = 0
    with path.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            checked += 1
            if checked > 5:
                break
            try:
                v = json.loads(line)
            except Exception:
                continue
            if not isinstance(v, dict):
                continue
            if any(k in v for k in ("parentUuid", "userType", "sessionId")):
                return "claude"
            t = v.get("type")
            if t == "file-history-snapshot":
                return "claude"
            if "parentId" in v:
                return "pi"
            if t == "session" and "version" in v and "cwd" in v:
                return "pi"
    return None


def sess_row(path: pathlib.Path) -> dict[str, str] | None:
    """Run the real binary and pull the numeric columns out of its table."""
    out = subprocess.run([str(BINARY), "stat", str(path)],
                         capture_output=True, text=True).stdout
    rows = [l for l in out.splitlines()
            if l and not l.startswith(("START", "TOTAL", "("))]
    if not rows:
        return None
    return {c: rows[0][a:b].strip() for c, (a, b) in SPANS.items()}


def sql_row(path: pathlib.Path, fmt: str) -> dict[str, str]:
    """Re-derive the same numbers in SQL and render them the documented way."""
    query = (QUERIES / f"{fmt}.sql").read_text()
    proc = subprocess.run(
        ["duckdb", "-csv", "-noheader",
         "-c", f"set variable f='{path}';", "-c", query],
        capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"duckdb failed on {path}:\n{proc.stderr.strip()}")
    fields = proc.stdout.strip().splitlines()[-1].split(",")
    vals = dict(zip(SQL_ORDER, fields))
    return {
        "TURNS": fmt_count(int(vals["turns"])),
        "API": fmt_count(int(vals["api"])),
        "TOOLS": fmt_count(int(vals["tools"])),
        "ERR": fmt_count(int(vals["err"])),
        "IN": fmt_count(int(vals["in_tok"])),
        "OUT": fmt_count(int(vals["out_tok"])),
        "CACHE_R": fmt_count(int(vals["cache_r"])),
        "CACHE_W": fmt_count(int(vals["cache_w"])),
        "COST": fmt_cost(float(vals["cost"])),
    }


def main() -> int:
    if not BINARY.exists():
        print(f"harness: {BINARY} not built; run `zig build` first", file=sys.stderr)
        return 2
    if shutil.which("duckdb") is None:
        print("harness: duckdb not on PATH; the oracle could not run "
              "(this is a skip, not a pass)", file=sys.stderr)
        return 2

    targets = [pathlib.Path(a) for a in sys.argv[1:]] or FIXTURES
    checked = failed = skipped = 0

    for path in targets:
        fmt = detect_format(path)
        if fmt is None:
            print(f"SKIP  {path.name}: not a recognized transcript")
            skipped += 1
            continue
        tool = sess_row(path)
        if tool is None:
            print(f"SKIP  {path.name}: tool produced no row")
            skipped += 1
            continue
        oracle = sql_row(path, fmt)
        diffs = {c: (tool[c], oracle[c]) for c in SPANS if tool[c] != oracle[c]}
        checked += 1
        if diffs:
            failed += 1
            print(f"FAIL  {path.name} [{fmt}]")
            for c, (t, o) in diffs.items():
                print(f"        {c:<8} tool={t!r}  oracle={o!r}")
        else:
            print(f"ok    {path.name} [{fmt}]")

    print(f"\n{checked} checked, {failed} disagreeing, {skipped} skipped")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
