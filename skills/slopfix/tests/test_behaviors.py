#!/usr/bin/env python3
"""External behavior harness for slopcheck.

Companion to test_cli.py. That harness pins the caller's contract — exit
codes, flag discrimination, guards. This one pins the scoring behaviors that
would otherwise be described only inside the implementation: which text the
partition drops, where sentences end, and when a lexicon entry is a tell
rather than an ordinary use of the word.

Every assertion reads the real binary's output over a committed fixture, so
the behavior survives a rewrite of the implementation in any language.

    python3 tests/test_behaviors.py ./bin/slopcheck
"""

import pathlib
import subprocess
import sys
import tempfile
import unittest

BIN = None
FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def run(*args):
    return subprocess.run(
        [BIN, *args], capture_output=True, text=True, timeout=30
    )


def verbose(name):
    """Score one fixture with -v and return (stdout, exit code)."""
    r = run("-v", str(FIXTURES / name))
    return r.stdout, r.returncode


def row(out, label):
    """The single report line carrying `label`."""
    lines = [l for l in out.splitlines() if label in l]
    if len(lines) != 1:
        raise AssertionError(f"expected one {label!r} row, got {lines!r}")
    return lines[0]


def hits(out, label):
    """The hit count from a `N hits` row."""
    fields = row(out, label).split()
    return int(fields[fields.index("hits") - 1])


class TestPartition(unittest.TestCase):
    """Text the scanner must drop before scoring."""

    def test_wrapped_list_unscored(self):
        # A list item's wrapped continuation lines carry no marker of their
        # own; without that state they read as prose and their vocabulary
        # scores. The fixture's prose also carries "at its core-dump", a
        # signposting phrase inside a longer hyphenated word: it must not
        # flag, so a clean exit here also pins phrase-boundary matching.
        out, code = verbose("wrapped_list.md")
        self.assertEqual(hits(out, "focal vocabulary"), 0, out)
        self.assertEqual(hits(out, "signposting filler"), 0, out)
        self.assertEqual(code, 0, out)

    def test_longer_closing_fence(self):
        # A ``` fence is closed by a longer run of the same character. The
        # sentence count is asserted too: a fence that fails to close
        # swallows the prose after it, which a hit count of zero alone would
        # not notice.
        out, _ = verbose("fence_edges.md")
        self.assertEqual(hits(out, "focal vocabulary"), 0, out)
        self.assertTrue(
            row(out, "words / sentences").endswith("/ 2"),
            row(out, "words / sentences"),
        )

    def test_backtick_inside_tilde_fence(self):
        # A ``` line inside a ~~~ fence is fence content, not a toggle.
        out, code = verbose("fence_edges.md")
        self.assertEqual(hits(out, "focal vocabulary"), 0, out)
        self.assertEqual(code, 0, out)


class TestSurface(unittest.TestCase):
    def test_surface_em_dash_regions(self):
        result = run(str(FIXTURES / "surface.md"))
        em_dashes = row(result.stdout, "em dashes")
        self.assertEqual(hits(result.stdout, "em dashes"), 6, result.stdout)
        self.assertIn("[FLAG]", em_dashes, result.stdout)
        self.assertEqual(result.returncode, 1, result.stdout)


class TestDirective(unittest.TestCase):
    def test_directive_suppresses_lexicon_not_emdash(self):
        path = FIXTURES / "directive.md"
        result = run(path)
        self.assertNotIn("focal vocabulary", result.stdout)
        self.assertIn("note: file directive suppressed lexicon rules", result.stdout)
        self.assertEqual(hits(result.stdout, "em dashes"), 1, result.stdout)
        self.assertIn("[FLAG]", row(result.stdout, "em dashes"), result.stdout)
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertEqual(result.stderr, "")

        quiet = run("-q", path)
        self.assertEqual(quiet.returncode, 1)
        self.assertEqual(quiet.stdout, "")
        self.assertEqual(quiet.stderr, "")

    def test_malformed_directive_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "bad.md"
            path.write_text("<!-- slopcheck: ignore all -->\n", encoding="utf-8")
            result = run(path)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, "")
            self.assertEqual(
                result.stderr,
                f"slopcheck: {path}:1: malformed directive; want "
                "'<!-- slopcheck: ignore lexicon -->'\n",
            )

    def test_later_directive_is_literal(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "later.md"
            path.write_text(
                "Ordinary first line.\n"
                "<!-- slopcheck: ignore lexicon -->\n"
                "Delve into the result.\n",
                encoding="utf-8",
            )
            result = run(path)
            self.assertEqual(hits(result.stdout, "focal vocabulary"), 1, result.stdout)
            self.assertNotIn("file directive suppressed", result.stdout)
            self.assertEqual(result.returncode, 1, result.stdout)

    def test_directive_is_per_input(self):
        with tempfile.TemporaryDirectory() as directory:
            plain = pathlib.Path(directory) / "plain.md"
            plain.write_text("Delve into the result.\n", encoding="utf-8")
            result = run(FIXTURES / "directive.md", plain)
            self.assertEqual(result.stdout.count("focal vocabulary"), 1, result.stdout)
            self.assertEqual(hits(result.stdout, "focal vocabulary"), 1, result.stdout)
            self.assertEqual(
                result.stdout.count("note: file directive suppressed lexicon rules"),
                1,
                result.stdout,
            )
            self.assertEqual(result.returncode, 1, result.stdout)


class TestSegmentation(unittest.TestCase):
    def test_segmentation_golden(self):
        # A decimal point and an abbreviation's period are not sentence
        # boundaries: the fixture holds exactly two sentences.
        out, _ = verbose("phrase_boundary.md")
        self.assertTrue(
            row(out, "words / sentences").endswith("/ 2"),
            row(out, "words / sentences"),
        )


class TestMatchBoundaries(unittest.TestCase):
    """A lexicon entry is a tell only in the shape the standard names."""

    def test_phrase_word_boundaries(self):
        # "fan-in summary" contains "in summary" but is not the ritual.
        out, code = verbose("phrase_boundary.md")
        self.assertEqual(hits(out, "closing ritual"), 0, out)
        self.assertEqual(code, 0, out)

    def test_closing_needs_sentence_start(self):
        # "To summarize," opens a sentence and counts; "too lazy to summarize
        # the log" is an infinitive with an object and does not.
        out, code = verbose("closing_initial.md")
        self.assertEqual(hits(out, "closing ritual"), 1, out)
        self.assertEqual(code, 1, out)

    def test_discourse_marker_needs_comma(self):
        # "Overall," and "Ultimately," count; "the overall latency" and
        # "Overall verdict:" do not.
        out, _ = verbose("discourse_marker.md")
        self.assertEqual(hits(out, "closing ritual"), 2, out)

    def test_bedrock_casing_and_soft_focal(self):
        # "Amazon Bedrock" is a product name; "the bedrock of" is the tell.
        # Soft-focal words are reported and never flagged.
        out, code = verbose("casing_soft.md")
        self.assertEqual(hits(out, "focal vocabulary"), 1, out)
        self.assertIn("FLAG", row(out, "focal vocabulary"), out)
        self.assertEqual(code, 1, out)

        soft = row(out, "soft focal")
        self.assertEqual(hits(out, "soft focal"), 2, out)
        self.assertIn("[--", soft, out)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: test_behaviors.py <path-to-slopcheck-binary>")
    BIN = str(pathlib.Path(sys.argv.pop(1)).resolve())
    unittest.main()
