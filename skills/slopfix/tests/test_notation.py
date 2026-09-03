#!/usr/bin/env python3
"""External harness for the two house typography rules: curly quotes and
emoji. Both are absolute flags on the natural-language surface, so code
spans and fences never count, and both close with the notation advice
rather than the substance advice.

    python3 tests/test_notation.py ./slopcheck.py
"""

import pathlib
import subprocess
import sys
import unittest

BIN = None
FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def run(*args, stdin=""):
    return subprocess.run(
        [BIN, *map(str, args)], input=stdin,
        capture_output=True, text=True, timeout=30,
    )


def row(out, label):
    lines = [line for line in out.splitlines() if label in line]
    if len(lines) != 1:
        raise AssertionError(f"expected one {label!r} row, got {lines!r}")
    return lines[0]


def hits(out, label):
    fields = row(out, label).split()
    return int(fields[fields.index("hits") - 1])


class TestNotationRules(unittest.TestCase):
    def test_fixture_flags_both_rules_with_exclusions(self):
        # The fixture carries four curly quotes and two emoji on the surface,
        # plus one of each inside a code span and a fence that must not count.
        r = run("-w", FIXTURES / "notation.md")
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("[FLAG]", row(r.stdout, "curly quotes"))
        self.assertEqual(hits(r.stdout, "curly quotes"), 4, r.stdout)
        self.assertIn("[FLAG]", row(r.stdout, "emoji"))
        self.assertEqual(hits(r.stdout, "emoji"), 2, r.stdout)

    def test_notation_only_closing_advice(self):
        r = run(FIXTURES / "notation.md")
        self.assertIn("notation flag(s). These are mechanical", r.stdout)
        self.assertNotIn("injecting substance", r.stdout)

    def test_clean_fixture_scores_zero(self):
        r = run(FIXTURES / "clean.md")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(hits(r.stdout, "curly quotes"), 0, r.stdout)
        self.assertEqual(hits(r.stdout, "emoji"), 0, r.stdout)

    def test_technical_profile_inherits_both(self):
        doc = "A “quoted” word and a ⭐ both land here.\n"
        for name in ("house", "technical"):
            r = run("-p", name, "-", stdin=doc)
            self.assertEqual(r.returncode, 1, f"{name}: " + r.stdout + r.stderr)
            self.assertEqual(hits(r.stdout, "curly quotes"), 2, r.stdout)
            self.assertEqual(hits(r.stdout, "emoji"), 1, r.stdout)

    def test_directive_does_not_suppress_typography(self):
        doc = ("<!-- slopcheck: ignore lexicon -->\n\n"
               "Delve into the ‘quoted’ log.\n")
        r = run("-", stdin=doc)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertNotIn("focal vocabulary", r.stdout)
        self.assertEqual(hits(r.stdout, "curly quotes"), 2, r.stdout)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: test_notation.py <path-to-slopcheck>")
    BIN = str(pathlib.Path(sys.argv.pop(1)).resolve())
    unittest.main()
