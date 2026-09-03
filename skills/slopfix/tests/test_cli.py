#!/usr/bin/env python3
"""External conformance harness for slopcheck.

Drives the real binary from outside, per the house default (stdlib-only,
binary path as argv[1]). The Go unit tests check the scanner's internals;
this checks the contract a caller depends on: exit codes, flag discrimination,
and that the guards do not silently disable the metrics.

    python3 tests/test_cli.py ./bin/slopcheck
"""

import pathlib
import subprocess
import sys
import unittest

BIN = None
FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def run(*args, input_text=None):
    return subprocess.run(
        [BIN, *args], capture_output=True, text=True, input=input_text, timeout=30
    )


class TestExitCodes(unittest.TestCase):
    def test_clean_prose_exits_zero(self):
        r = run(str(FIXTURES / "clean.md"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("no surface flags", r.stdout)

    def test_slop_exits_one(self):
        r = run(str(FIXTURES / "slop.md"))
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)

    def test_missing_file_exits_two(self):
        r = run(str(FIXTURES / "does-not-exist.md"))
        self.assertEqual(r.returncode, 2)

    def test_no_args_exits_two(self):
        self.assertEqual(run().returncode, 2)

    def test_help_exits_zero(self):
        r = run("--help")
        self.assertEqual(r.returncode, 0)
        self.assertIn("usage: slopcheck", r.stdout)


class TestStdin(unittest.TestCase):
    def test_clean_stdin_exits_zero_and_displays_stdin(self):
        r = run("-", input_text=(FIXTURES / "clean.md").read_text())
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(r.stdout.startswith("<stdin>\n"), r.stdout)

    def test_flagged_stdin_exits_one(self):
        r = run("-", input_text=(FIXTURES / "slop.md").read_text())
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("FLAG", r.stdout)

    def test_file_stdin_file_preserves_argument_order(self):
        first = str(FIXTURES / "clean.md")
        last = str(FIXTURES / "slop.md")
        r = run(first, "-", last, input_text=(FIXTURES / "clean.md").read_text())
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        positions = (
            r.stdout.find(first + "\n"),
            r.stdout.find("<stdin>\n"),
            r.stdout.find(last + "\n"),
        )
        self.assertTrue(0 <= positions[0] < positions[1] < positions[2], positions)

    def test_duplicate_stdin_is_a_usage_error(self):
        r = run("-", "-", input_text="must not be read")
        self.assertEqual(r.returncode, 2, r.stdout + r.stderr)
        self.assertTrue(
            r.stderr.startswith("slopcheck: standard input '-' may appear only once\n"),
            r.stderr,
        )
        self.assertIn("usage: slopcheck [options] <file|->...", r.stderr)

    def test_quiet_flagged_stdin_prints_nothing(self):
        r = run("-q", "-", input_text=(FIXTURES / "slop.md").read_text())
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertEqual(r.stdout, "")


class TestDiscrimination(unittest.TestCase):
    """The tool is only worth running if it separates the two fixtures."""

    def test_slop_trips_the_lexicon_metrics(self):
        out = run(str(FIXTURES / "slop.md")).stdout
        for metric in ("focal vocabulary", "signposting filler",
                       "closing ritual", "sycophantic opener"):
            line = next(l for l in out.splitlines() if metric in l)
            self.assertIn("FLAG", line, f"{metric} should flag on slop.md")

    def test_clean_trips_nothing(self):
        out = run(str(FIXTURES / "clean.md")).stdout
        self.assertNotIn("FLAG", out)

    def test_slop_is_flatter_than_clean(self):
        def cv(name):
            out = run("-v", str(FIXTURES / name)).stdout
            line = next(l for l in out.splitlines() if "burstiness" in l)
            return float(line.split()[-1])

        self.assertLess(cv("slop.md"), cv("clean.md"))


class TestPartition(unittest.TestCase):
    """Regressions: partition bugs that let code score as prose."""

    def test_indented_code_does_not_flag(self):
        # 4-space-indented code full of lexicon words must stay out of prose.
        r = run(str(FIXTURES / "indented_code.md"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("FLAG", r.stdout)

    def test_tilde_fence_contains_backtick_lines(self):
        # A ``` line inside a ~~~ fence is fence content, not a toggle; the
        # lexicon words between the tildes must never reach the prose scan.
        r = run(str(FIXTURES / "tilde_fence.md"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("FLAG", r.stdout)


class TestSegmentation(unittest.TestCase):
    def test_abbreviations_golden_sentence_count(self):
        # "Mr.", "U.S.", "No. 7", "Dr.", "etc." must not split; the fixture
        # holds exactly three sentences.
        out = run("-v", str(FIXTURES / "abbreviations.md")).stdout
        line = next(l for l in out.splitlines() if "words / sentences" in l)
        self.assertEqual(int(line.split()[-1]), 3)


class TestGuards(unittest.TestCase):
    def test_shape_is_scored_on_both_fixtures(self):
        """Regression: a ratio-based guard once disabled burstiness on every
        real document in the estate. Both fixtures must be scored, not
        skipped."""
        for name in ("clean.md", "slop.md"):
            out = run(str(FIXTURES / name)).stdout
            self.assertNotIn("too little to score", out, name)

    def test_multiple_files_report_separately(self):
        r = run(str(FIXTURES / "clean.md"), str(FIXTURES / "slop.md"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("clean.md", r.stdout)
        self.assertIn("slop.md", r.stdout)

    def test_quiet_prints_nothing(self):
        r = run("-q", str(FIXTURES / "slop.md"))
        self.assertEqual(r.stdout, "")
        self.assertEqual(r.returncode, 1)

    def test_where_lists_hit_locations(self):
        # The directive fixture carries one em dash at a known byte column,
        # and the directive line is removed with its newline kept, so the
        # reported line number matches the file on disk.
        r = run("-w", str(FIXTURES / "directive.md"))
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("where: 3:22", r.stdout)
        bare = run(str(FIXTURES / "directive.md"))
        self.assertNotIn("where:", bare.stdout)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: test_cli.py <path-to-slopcheck-binary>")
    BIN = str(pathlib.Path(sys.argv.pop(1)).resolve())
    unittest.main()
