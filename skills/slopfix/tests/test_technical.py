#!/usr/bin/env python3
"""External contract harness for the technical profile.

Drives the real binary by path. The technical profile is a strict superset
of house: every house rule at house policy, plus three notation advisories.

    python3 tests/test_technical.py ./slopcheck.py
"""

import pathlib
import subprocess
import sys
import unittest

BIN = None
FIXTURES = pathlib.Path(__file__).parent / "fixtures"
OVERLAYS = FIXTURES / "overlays"

# One report label per surviving rule, in the profile's adjudicated order.
# Labels are the stable rule tokens shared with the corpus record and docs.
SURVIVORS = ["optional-plurals", "time-marker", "heading-period"]


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


class TestTechnicalProfile(unittest.TestCase):
    def test_clean_fixture_exits_0_under_both_profiles(self):
        path = FIXTURES / "technical-clean.md"
        for name in ("house", "technical"):
            r = run("-p", name, path)
            self.assertEqual(r.returncode, 0, f"{name}: " + r.stdout + r.stderr)
            self.assertNotIn("[FLAG]", r.stdout, f"{name}: " + r.stdout)
            if name == "technical":
                for label in SURVIVORS:
                    self.assertEqual(hits(r.stdout, label), 0, r.stdout)

    def test_fixture_reports_each_survivor_once_under_technical_only(self):
        path = FIXTURES / "technical-slop.md"
        house = run("-p", "house", path)
        self.assertEqual(house.returncode, 0, house.stdout + house.stderr)
        for label in SURVIVORS:
            self.assertNotIn(label, house.stdout)

        tech = run("-p", "technical", path)
        self.assertEqual(tech.returncode, 0, tech.stdout + tech.stderr)
        self.assertNotIn("[FLAG]", tech.stdout)
        for label in SURVIVORS:
            self.assertIn("[NOTE]", row(tech.stdout, label))
            self.assertEqual(hits(tech.stdout, label), 1, tech.stdout)

    def test_overlay_composes_with_technical_profile(self):
        # Lexicon overlays and technical notation advisories compose.
        r = run("-p", "technical", "--overlay", OVERLAYS / "add_cache.lex",
                FIXTURES / "technical-slop.md")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("[NOTE]", row(r.stdout, "focal vocabulary"))
        for label in SURVIVORS:
            self.assertIn("[NOTE]", row(r.stdout, label))

    def test_em_dash_flag_inherited_from_house(self):
        doc = "One em dash — lands here.\n"
        for name in ("house", "technical"):
            r = run("-p", name, "-", stdin=doc)
            self.assertEqual(r.returncode, 1, f"{name}: " + r.stdout + r.stderr)
            self.assertIn("[FLAG]", row(r.stdout, "em dashes"))
            self.assertEqual(hits(r.stdout, "em dashes"), 1, r.stdout)

    def test_math_and_abbreviation_are_not_notation_findings(self):
        doc = "## U.S.\n\nThe transfer function H(s) has one pole.\n"
        r = run("-p", "technical", "-", stdin=doc)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(hits(r.stdout, "optional-plurals"), 0, r.stdout)
        self.assertEqual(hits(r.stdout, "heading-period"), 0, r.stdout)

    def test_directive_preserves_technical_advisory(self):
        # The directive suppresses vocabulary, not notation.
        doc = ("<!-- slopcheck: ignore lexicon -->\n\n"
               "Delve into the port(s) table.\n")
        r = run("-p", "technical", "-", stdin=doc)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("note: file directive suppressed lexicon rules", r.stdout)
        self.assertNotIn("focal vocabulary", r.stdout)
        self.assertIn("[NOTE]", row(r.stdout, "optional-plurals"))
        self.assertEqual(hits(r.stdout, "optional-plurals"), 1, r.stdout)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: test_technical.py <path-to-slopcheck-binary>")
    BIN = str(pathlib.Path(sys.argv.pop(1)).resolve())
    unittest.main()
