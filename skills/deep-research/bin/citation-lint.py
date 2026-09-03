#!/usr/bin/env python3
"""Citation lint for research reports (deep-research code gate).

Checks a markdown report:
  1. every inline [n] citation resolves to an entry in the Sources section
  2. every Sources entry carries an http(s) URL
  3. source numbering is contiguous from 1

Exit 0 = clean (warnings allowed), exit 1 = failures listed on stdout.
Usage: citation-lint.py <report.md>
"""

import re
import sys
from pathlib import Path


def split_sources(text: str):
    """Return (body, sources_block). Sources = last heading matching 'sources'."""
    matches = list(re.finditer(r"^#{1,4}\s*(?:\d+[\.\)]\s*)?sources\b.*$", text,
                               re.IGNORECASE | re.MULTILINE))
    if not matches:
        return text, None
    m = matches[-1]
    return text[: m.start()], text[m.end():]


def parse_source_numbers(block: str):
    """Map source number -> its entry line, for numbered-list styles used in reports."""
    entries = {}
    for line in block.splitlines():
        stripped = line.strip()
        m = re.match(r"^(?:\[(\d+)\]|(\d+)[\.\)])\s+(.*)$", stripped)
        if m:
            num = int(m.group(1) or m.group(2))
            entries[num] = m.group(3)
    return entries


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip())
        return 1
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")

    failures, warnings = [], []
    body, sources_block = split_sources(text)

    if sources_block is None:
        print("FAIL: no Sources section found")
        return 1

    sources = parse_source_numbers(sources_block)
    cited = {int(n) for n in re.findall(r"\[(\d+)\]", body)}

    for n in sorted(cited - set(sources)):
        failures.append(f"citation [{n}] has no matching Sources entry")

    for n, entry in sorted(sources.items()):
        if not re.search(r"https?://\S+", entry):
            failures.append(f"source [{n}] has no URL: {entry[:80]}")

    for n in sorted(set(sources) - cited):
        warnings.append(f"source [{n}] is listed but uncited in the body")

    if sources:
        expected = set(range(1, max(sources) + 1))
        for n in sorted(expected - set(sources)):
            warnings.append(f"source numbering skips [{n}]")

    for msg in failures:
        print(f"FAIL: {msg}")
    for msg in warnings:
        print(f"warn: {msg}")

    if failures:
        print(f"\n{len(failures)} failure(s) — fix and re-run.")
        return 1
    print(f"clean: {len(cited)} citation numbers, {len(sources)} sources"
          + (f", {len(warnings)} warning(s)" if warnings else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
