#!/usr/bin/env python3
"""The boundedness half of the thesis, asserted the way it is stated.

Output size is capped by --context and does not grow with input size. Two
sweeps establish which term the report actually tracks:

  * input size across four orders of magnitude at a fixed context -> flat
  * context across two orders of magnitude at a fixed input       -> moves

Both use short relative paths and a fixed working directory. The report echoes
the file names it was given, so a sweep run with long absolute paths measures
the path length as much as the report; an earlier measurement was inflated by
roughly 215 bytes that way.
"""

import subprocess
import sys
from pathlib import Path

# Output may legitimately drift by the decimal width of the byte counts as
# inputs grow (4 KB -> 4 MB adds three digits, twice, plus the prefix count).
FLAT_TOLERANCE = 64

INPUT_SIZES_KB = (1, 16, 256, 4096)
CONTEXTS = (4, 64, 512)


def payload(n: int) -> bytes:
    """JSON-ish ASCII, so escaping expansion resembles a real request body."""
    unit = b'{"role":"user","content":"abcdefgh ijklmnop"},'
    return (unit * (n // len(unit) + 1))[:n]


def run_size(binary: str, workdir: Path, args: list[str]) -> int:
    r = subprocess.run([binary] + args, cwd=workdir, capture_output=True)
    if r.returncode not in (0, 1):
        raise SystemExit(f"boundedness: unexpected exit {r.returncode}: {r.stderr!r}")
    return len(r.stdout)


def main() -> int:
    binary = sys.argv[1]
    workdir = Path(sys.argv[2])
    failures = 0

    # Sweep 1: input size varies, context fixed.
    sizes = []
    for kb in INPUT_SIZES_KB:
        n = kb * 1024
        data = payload(n)
        (workdir / "a").write_bytes(data)
        (workdir / "b").write_bytes(data[: n // 2] + b"X" + data[n // 2 + 1:])
        sizes.append((kb, run_size(binary, workdir, ["-c", "64", "a", "b"])))

    spread = max(s for _, s in sizes) - min(s for _, s in sizes)
    detail = ", ".join(f"{kb}KB->{s}B" for kb, s in sizes)
    ratio = INPUT_SIZES_KB[-1] // INPUT_SIZES_KB[0]
    if spread > FLAT_TOLERANCE:
        print(f"FAIL: output grew {spread}B across a {ratio}x input sweep, "
              f"tolerance {FLAT_TOLERANCE}B")
        failures += 1
        verdict = f"spread {spread}B > {FLAT_TOLERANCE}B tolerance"
    else:
        verdict = f"spread {spread}B <= {FLAT_TOLERANCE}B tolerance"
    print(f"input sweep  (-c 64): {detail} | {verdict}")

    # Sweep 2: context varies, input fixed at the largest size above.
    ctx = [(c, run_size(binary, workdir, ["-c", str(c), "a", "b"])) for c in CONTEXTS]
    detail = ", ".join(f"-c {c}->{s}B" for c, s in ctx)
    if not all(ctx[i][1] < ctx[i + 1][1] for i in range(len(ctx) - 1)):
        print(f"FAIL: output did not grow with --context ({detail})")
        failures += 1
    print(f"context sweep ({INPUT_SIZES_KB[-1]}KB input): {detail}")

    # The summary line carries no file names and no window, so it is bounded
    # outright rather than by a tolerance.
    porcelain = {run_size(binary, workdir, ["-p", "-c", str(c), "a", "b"]) for c in CONTEXTS}
    if len(porcelain) != 1:
        print(f"FAIL: --porcelain output varies with --context ({sorted(porcelain)})")
        failures += 1
    print(f"porcelain line: {porcelain.pop()}B, invariant across --context")

    print(f"boundedness: {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
