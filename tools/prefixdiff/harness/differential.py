#!/usr/bin/env python3
"""Differential oracle for the compute core.

Two independent checks per generated pair:

  * `cmp(1)` — an independently authored, POSIX-specified implementation of
    the same question, older than anything in this repo. It gives the exit
    code and the first differing byte.
  * a re-derivation in this file, computed from the raw bytes rather than from
    the tool's source, covering the fields `cmp` has no opinion about:
    the outcome class, the common-prefix percentages, and line/column.

The tool is driven through its real command line and read through
`--porcelain`, never through the human-readable report. A harness that parses
prose inherits the prose's churn: an earlier version of this file matched the
literal word "bytes" and broke when a plural was corrected.
"""

import random
import re
import subprocess
import sys
from pathlib import Path

SHAPES = ("identical", "mutate", "extend", "truncate", "empty")


def derive(a: bytes, b: bytes) -> dict:
    """Expected report, computed from the bytes alone."""
    n = min(len(a), len(b))
    off = n
    for i in range(n):
        if a[i] != b[i]:
            off = i
            break

    if a == b:
        status = "identical"
    elif off == len(a) or off == len(b):
        status = "prefix"
    else:
        status = "differ"

    def pct(part: int, whole: int) -> float:
        return 100.0 if whole == 0 else 100.0 * part / whole

    out = {
        "status": status,
        "prefix": off,
        "a_bytes": len(a),
        "b_bytes": len(b),
        "a_pct": pct(off, len(a)),
        "b_pct": pct(off, len(b)),
    }
    if status == "differ":
        head = a[:off]
        out["line"] = 1 + head.count(b"\n")
        out["col"] = off - (head.rfind(b"\n") + 1) + 1
    return out


def parse_porcelain(line: str) -> dict:
    out = {}
    for field in line.strip().split(" "):
        k, _, v = field.partition("=")
        out[k] = v
    return out


def cmp_offset(a_path: Path, b_path: Path, a: bytes, b: bytes):
    """(exit code, first differing byte or None) according to cmp(1)."""
    r = subprocess.run(["cmp", str(a_path), str(b_path)],
                       capture_output=True, text=True)
    if r.returncode == 0:
        return 0, None
    m = re.search(r"differ: byte (\d+)", r.stdout)
    if m:
        return r.returncode, int(m.group(1)) - 1  # cmp is 1-based
    # cmp reports a strict prefix as "EOF on <file>" and says nothing about
    # an offset, so the divergence point is the shorter length by definition.
    if "EOF on" in r.stderr:
        return r.returncode, min(len(a), len(b))
    return r.returncode, None


def generate(rng: random.Random) -> tuple[bytes, bytes, str]:
    n = rng.randint(0, 4000)
    a = bytes(rng.getrandbits(8) for _ in range(n))
    shape = rng.choice(SHAPES)
    if shape == "identical" or n == 0:
        b = a
    elif shape == "mutate":
        i = rng.randrange(n)
        b = a[:i] + bytes([a[i] ^ 0xFF]) + a[i + 1:]
    elif shape == "extend":
        b = a + bytes(rng.getrandbits(8) for _ in range(rng.randint(1, 50)))
    elif shape == "truncate":
        b = a[:rng.randrange(n)]
    else:
        b = b""
    return a, b, shape


def main() -> int:
    binary = sys.argv[1]
    workdir = Path(sys.argv[2])
    trials = int(sys.argv[3]) if len(sys.argv) > 3 else 500
    seed = int(sys.argv[4]) if len(sys.argv) > 4 else 20260806

    rng = random.Random(seed)
    a_path, b_path = workdir / "a", workdir / "b"
    failures = 0
    seen = {s: 0 for s in SHAPES}

    for trial in range(trials):
        a, b, shape = generate(rng)
        seen[shape] += 1
        a_path.write_bytes(a)
        b_path.write_bytes(b)

        run = subprocess.run([binary, "--porcelain", "a", "b"],
                             cwd=workdir, capture_output=True, text=True)
        want = derive(a, b)
        want_rc = 0 if want["status"] == "identical" else 1

        def bad(msg):
            nonlocal failures
            failures += 1
            print(f"FAIL trial={trial} shape={shape} lenA={len(a)} lenB={len(b)}: {msg}")

        if run.returncode != want_rc:
            bad(f"exit {run.returncode}, expected {want_rc}")
            continue

        got = parse_porcelain(run.stdout)
        for key in ("status", "prefix", "a_bytes", "b_bytes"):
            if str(want[key]) != got.get(key):
                bad(f"{key}={got.get(key)!r}, expected {want[key]!r}")
        for key in ("a_pct", "b_pct"):
            if abs(float(got.get(key, "nan")) - want[key]) > 0.06:
                bad(f"{key}={got.get(key)!r}, expected ~{want[key]:.1f}")
        for key in ("line", "col"):
            if key in want:
                if str(want[key]) != got.get(key):
                    bad(f"{key}={got.get(key)!r}, expected {want[key]!r}")
            elif key in got:
                bad(f"{key} present as {got[key]!r} on status={want['status']}")

        # cmp is the independent implementation, and only speaks to the offset
        # and the exit code.
        cmp_rc, cmp_off = cmp_offset(a_path, b_path, a, b)
        if cmp_rc != run.returncode:
            bad(f"exit {run.returncode}, cmp said {cmp_rc}")
        if cmp_off is not None and cmp_off != want["prefix"]:
            bad(f"cmp offset {cmp_off}, tool/derivation said {want['prefix']}")

    unseen = [s for s, n in seen.items() if n == 0]
    if unseen:
        print(f"FAIL: shape classes never generated: {', '.join(unseen)}")
        failures += 1

    counts = " ".join(f"{s}={n}" for s, n in seen.items())
    print(f"differential: {trials} pairs (seed {seed}) [{counts}] -> {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
