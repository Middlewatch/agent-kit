#!/usr/bin/env python3
"""External conformance harness for slopcheck.

Drives the real binary from outside, per the house default (stdlib-only,
binary path as argv[1]). Checks the caller's contract: advisory versus
convention findings, exit codes, and measurement guards.

    python3 tests/test_cli.py ./slopcheck.py
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
        self.assertIn("0 convention flag(s)", r.stdout)

    def test_advisory_only_exits_zero(self):
        r = run(str(FIXTURES / "slop.md"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("[NOTE]", r.stdout)
        self.assertNotIn("[FLAG]", r.stdout)

    def test_convention_exits_one(self):
        r = run(str(FIXTURES / "surface.md"))
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
        for topic in ("advisory", "technical", "drop TEXT", "ignore lexicon"):
            self.assertIn(topic, r.stdout)


class TestStdin(unittest.TestCase):
    def test_clean_stdin_exits_zero_and_displays_stdin(self):
        r = run("-", input_text=(FIXTURES / "clean.md").read_text())
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertTrue(r.stdout.startswith("<stdin>\n"), r.stdout)

    def test_flagged_stdin_exits_one(self):
        r = run("-", input_text=(FIXTURES / "surface.md").read_text())
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("FLAG", r.stdout)

    def test_file_stdin_file_preserves_argument_order(self):
        first = str(FIXTURES / "clean.md")
        last = str(FIXTURES / "surface.md")
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
        r = run("-q", "-", input_text=(FIXTURES / "surface.md").read_text())
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertEqual(r.stdout, "")


class TestDiscrimination(unittest.TestCase):
    """The tool is only worth running if it separates the two fixtures."""

    def test_slop_reports_lexicon_advisories(self):
        out = run(str(FIXTURES / "slop.md")).stdout
        for metric in ("focal vocabulary", "signposting filler",
                       "closing ritual", "sycophantic opener"):
            line = next(l for l in out.splitlines() if metric in l)
            self.assertIn("NOTE", line, f"{metric} should advise on slop.md")

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

    def assert_no_lexicon_hits(self, out):
        for metric in ("focal vocabulary", "soft focal", "signposting filler",
                       "closing ritual", "sycophantic opener"):
            line = next(l for l in out.splitlines() if metric in l)
            fields = line.split()
            self.assertEqual(int(fields[fields.index("hits") - 1]), 0, line)

    def test_indented_code_does_not_flag(self):
        # 4-space-indented code full of lexicon words must stay out of prose.
        r = run(str(FIXTURES / "indented_code.md"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("FLAG", r.stdout)
        self.assert_no_lexicon_hits(r.stdout)

    def test_tilde_fence_contains_backtick_lines(self):
        # A ``` line inside a ~~~ fence is fence content, not a toggle; the
        # lexicon words between the tildes must never reach the prose scan.
        r = run(str(FIXTURES / "tilde_fence.md"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("FLAG", r.stdout)
        self.assert_no_lexicon_hits(r.stdout)


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
        r = run(str(FIXTURES / "clean.md"), str(FIXTURES / "surface.md"))
        self.assertEqual(r.returncode, 1)
        self.assertIn("clean.md", r.stdout)
        self.assertIn("surface.md", r.stdout)

    def test_quiet_prints_nothing(self):
        r = run("-q", str(FIXTURES / "surface.md"))
        self.assertEqual(r.stdout, "")
        self.assertEqual(r.returncode, 1)

    def test_shape_rewrites_do_not_change_exit_status(self):
        sentence = ("The worker writes each completed record to disk before it "
                    "acknowledges the request as successful.")
        original = run("-", input_text=" ".join([sentence] * 10))
        joined = run("-", input_text=" ".join([sentence[:-1] + "; " + sentence] * 5))
        self.assertEqual(original.returncode, 0, original.stdout)
        self.assertEqual(joined.returncode, 0, joined.stdout)
        for metric in ("burstiness", "14-22 word band"):
            line = next(l for l in original.stdout.splitlines() if metric in l)
            self.assertIn("[NOTE]", line)
        self.assertIn("too little to score", joined.stdout)
        self.assertNotIn("[FLAG]", original.stdout + joined.stdout)

    def test_correct_name_is_advisory_not_a_rewrite_order(self):
        r = run("-w", "-", input_text="Foster reviewed the patch.")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("[NOTE] focal vocabulary", r.stdout)
        self.assertIn("where: 1", r.stdout)
        self.assertIn("0 convention flag(s); 1 advisory rule(s) matched.", r.stdout)
        self.assertNotIn("injecting substance", r.stdout)

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
