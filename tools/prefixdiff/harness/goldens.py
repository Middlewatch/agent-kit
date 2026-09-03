#!/usr/bin/env python3
"""Recorded output for the rendering, which `cmp` cannot check.

The escaping table, the ellipsis and EOF markers, the percentage formatting,
the plurals, the strict-prefix wording, the summary line's field order and the
error messages are choices this tool makes alone. Nothing external can say they
are right, so they are pinned byte-for-byte instead: these goldens detect
change, they do not establish correctness.

Fixtures use short relative names and a fixed working directory, because the
report echoes the names it was given.

    goldens.py <binary> <workdir>            compare against harness/goldens/
    goldens.py <binary> <workdir> --record   rewrite them
"""

import subprocess
import sys
from pathlib import Path

GOLDEN_DIR = Path(__file__).resolve().parent / "goldens"

HOSTILE_NAME = "nm\x1b]0;PWNED\x07x"

FIXTURES = {
    "same": b"hello world",
    "other": b"hello WORLD",
    "short": b"hello",
    "empty": b"",
    # D3: content carrying OSC title-set, NUL, DEL and a high byte.
    "ctrl": b"safe\x1b]0;A\x07\x00\x7f\xffend",
    "ctrl2": b"safe\x1b]0;B\x07\x00\x7f\xffend",
    # Long enough that a small context truncates on both sides.
    "long": bytes(range(0x30, 0x70)) * 2,
    "long2": bytes(range(0x30, 0x70)) + b"!" + bytes(range(0x31, 0x70)),
    # D3: an attacker-chosen file name, reached the way a glob would reach it.
    HOSTILE_NAME: b"hello world",
    # R8: a name the option parser would otherwise claim.
    "-dash.txt": b"hello there",
}

CASES = [
    ("identical", ["same", "same"]),
    ("differ-mid", ["same", "other"]),
    ("prefix-a-shorter", ["short", "same"]),
    ("prefix-b-shorter", ["same", "short"]),
    ("empty-a", ["empty", "same"]),
    ("both-empty", ["empty", "empty"]),
    ("control-bytes", ["-c", "12", "ctrl", "ctrl2"]),
    ("hostile-filename", [HOSTILE_NAME, "other"]),
    ("context-zero", ["-c", "0", "same", "other"]),
    ("context-truncated", ["-c", "6", "long", "long2"]),
    ("context-saturating", ["-c", "18446744073709551615", "same", "other"]),
    ("porcelain-differ", ["-p", "same", "other"]),
    ("porcelain-identical", ["-p", "same", "same"]),
    ("porcelain-prefix", ["-p", "short", "same"]),
    ("porcelain-empty-a", ["-p", "empty", "same"]),
    ("quiet-differ", ["-q", "same", "other"]),
    ("dash-dash", ["--", "-dash.txt", "same"]),
    ("help", ["-h"]),
    ("err-missing-file", ["same", "nope"]),
    ("err-unknown-option", ["-Z", "same", "other"]),
    ("err-hostile-option", ["-\x1b]0;X\x07", "same", "other"]),
    ("err-quiet-porcelain", ["-q", "-p", "same", "other"]),
    ("err-one-file", ["same"]),
    ("err-bad-context", ["-c", "eight", "same", "other"]),
]


def setup(workdir: Path) -> None:
    for name, data in FIXTURES.items():
        (workdir / name).write_bytes(data)


# D3: no byte derived from input may reach a terminal unflattened. The tool's
# own markers are UTF-8 (┃, …, ⟨EOF⟩), so the assertion is about control bytes
# rather than about being ASCII: everything an attacker can influence is
# escaped to printable ASCII before it is printed.
FORBIDDEN = set(range(0x00, 0x20)) - {0x0A} | {0x7F}


def check_d3(name: str, stream: str, data: bytes) -> list[str]:
    found = sorted({b for b in data if b in FORBIDDEN})
    if not found:
        return []
    return [f"FAIL {name}: control byte(s) {[hex(b) for b in found]} reached {stream}"]


def transcript(binary: str, workdir: Path, argv: list[str]) -> tuple[str, list[str]]:
    r = subprocess.run([binary] + argv, cwd=workdir, capture_output=True)
    problems = (check_d3(name_of(argv), "stdout", r.stdout)
                + check_d3(name_of(argv), "stderr", r.stderr))
    text = (
        f"$ prefixdiff {' '.join(escape_arg(a) for a in argv)}\n"
        f"exit={r.returncode}\n"
        f"--- stdout ---\n{r.stdout.decode('utf-8')}"
        f"--- stderr ---\n{r.stderr.decode('utf-8')}"
    )
    return text, problems


def escape_arg(arg: str) -> str:
    """Arguments appear in the golden's command line, and two of them carry
    control bytes on purpose; the golden itself must stay readable."""
    return "".join(c if c.isprintable() else f"\\x{ord(c):02x}" for c in arg)


def name_of(argv: list[str]) -> str:
    return " ".join(escape_arg(a) for a in argv)


def main() -> int:
    binary, workdir = sys.argv[1], Path(sys.argv[2])
    record = "--record" in sys.argv[3:]
    setup(workdir)
    GOLDEN_DIR.mkdir(exist_ok=True)

    failures = 0
    for name, argv in CASES:
        got, problems = transcript(binary, workdir, argv)
        for p in problems:
            print(p)
        failures += len(problems)

        path = GOLDEN_DIR / f"{name}.txt"
        if record:
            path.write_text(got, encoding="utf-8")
            continue
        if not path.exists():
            print(f"FAIL {name}: no golden at {path.name}; run with --record")
            failures += 1
            continue
        want = path.read_text(encoding="utf-8")
        if got != want:
            failures += 1
            print(f"FAIL {name}:")
            for line in _diff(want, got):
                print(f"    {line}")

    if record:
        print(f"goldens: recorded {len(CASES)} cases "
              f"({failures} D3 violation(s) — recording does not excuse them)")
        return 1 if failures else 0
    print(f"goldens: {len(CASES)} cases, D3 asserted on every stream "
          f"-> {failures} failure(s)")
    return 1 if failures else 0


def _diff(want: str, got: str):
    import difflib
    return list(difflib.unified_diff(
        want.splitlines(), got.splitlines(),
        fromfile="golden", tofile="actual", lineterm="", n=1))[:24]


if __name__ == "__main__":
    sys.exit(main())
