#!/usr/bin/env python3
"""External contract harness for the technical profile.

Drives the real binary by path. The technical profile is a strict superset
of house: every house rule at house policy, plus the three corpus-approved
rules as flags.

    python3 tests/test_technical.py ./bin/slopcheck
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

    def test_slop_fixture_flags_each_survivor_once_under_technical_only(self):
        path = FIXTURES / "technical-slop.md"
        house = run("-p", "house", path)
        self.assertEqual(house.returncode, 0, house.stdout + house.stderr)
        for label in SURVIVORS:
            self.assertNotIn(label, house.stdout)

        tech = run("-p", "technical", path)
        self.assertEqual(tech.returncode, 1, tech.stdout + tech.stderr)
        flag_rows = [l for l in tech.stdout.splitlines() if "[FLAG]" in l]
        self.assertEqual(len(flag_rows), len(SURVIVORS), tech.stdout)
        for label in SURVIVORS:
            self.assertIn("[FLAG]", row(tech.stdout, label))
            self.assertEqual(hits(tech.stdout, label), 1, tech.stdout)

    def test_overlay_composes_with_technical_profile(self):
        # The overlay adds a house-class focal word; the technical rules keep
        # flagging beside it, so overlay merge and profile selection compose.
        r = run("-p", "technical", "--overlay", OVERLAYS / "add_cache.lex",
                FIXTURES / "technical-slop.md")
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("[FLAG]", row(r.stdout, "focal vocabulary"))
        for label in SURVIVORS:
            self.assertIn("[FLAG]", row(r.stdout, label))

    def test_em_dash_flag_inherited_from_house(self):
        doc = "One em dash — lands here.\n"
        for name in ("house", "technical"):
            r = run("-p", name, "-", stdin=doc)
            self.assertEqual(r.returncode, 1, f"{name}: " + r.stdout + r.stderr)
            self.assertIn("[FLAG]", row(r.stdout, "em dashes"))
            self.assertEqual(hits(r.stdout, "em dashes"), 1, r.stdout)

    def test_directive_preserves_technical_flag(self):
        # The lexicon directive suppresses lexicon rules only: the focal word
        # goes unscored while the surviving technical flag still raises.
        doc = ("<!-- slopcheck: ignore lexicon -->\n\n"
               "Delve into the port(s) table.\n")
        r = run("-p", "technical", "-", stdin=doc)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("note: file directive suppressed lexicon rules", r.stdout)
        self.assertNotIn("focal vocabulary", r.stdout)
        self.assertIn("[FLAG]", row(r.stdout, "optional-plurals"))
        self.assertEqual(hits(r.stdout, "optional-plurals"), 1, r.stdout)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: test_technical.py <path-to-slopcheck-binary>")
    BIN = str(pathlib.Path(sys.argv.pop(1)).resolve())
    unittest.main()
