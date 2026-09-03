#!/usr/bin/env python3
"""External contract harness for profiles and lexicon overlays.

Drives the real binary by path and keeps the overlay wire format independent
of the Go implementation.

    python3 tests/test_overlay.py ./bin/slopcheck
"""

import pathlib
import subprocess
import sys
import unittest

BIN = None
FIXTURES = pathlib.Path(__file__).parent / "fixtures"
OVERLAYS = FIXTURES / "overlays"


def run(*args):
    return subprocess.run(
        [BIN, *map(str, args)], capture_output=True, text=True, timeout=30
    )


def row(out, label):
    lines = [line for line in out.splitlines() if label in line]
    if len(lines) != 1:
        raise AssertionError(f"expected one {label!r} row, got {lines!r}")
    return lines[0]


def hits(out, label):
    fields = row(out, label).split()
    return int(fields[fields.index("hits") - 1])


class TestProfileOverlay(unittest.TestCase):
    def test_profile_house_explicit_matches_default(self):
        path = FIXTURES / "slop.md"
        bare = run(path)
        explicit = run("-p", "house", path)
        self.assertEqual(explicit.returncode, bare.returncode)
        self.assertEqual(explicit.stdout, bare.stdout)
        self.assertEqual(explicit.stderr, bare.stderr)

    def test_unknown_profile_exits_2(self):
        r = run("-p", "nope", FIXTURES / "clean.md")
        self.assertEqual(r.returncode, 2)
        self.assertEqual(
            r.stderr,
            "slopcheck: unknown profile 'nope' (known: house, technical)\n",
        )

    def test_overlay_add_flags_new_word(self):
        # This fixture dependency is deliberate: clean.md uses "cache" in
        # ordinary prose while the base house profile leaves it unflagged.
        path = FIXTURES / "clean.md"
        bare = run(path)
        self.assertEqual(bare.returncode, 0, bare.stdout + bare.stderr)
        r = run("--overlay", OVERLAYS / "add_cache.lex", path)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn("FLAG", row(r.stdout, "focal vocabulary"))

    def test_directive_suppresses_overlay(self):
        r = run(
            "--overlay",
            OVERLAYS / "add_cache.lex",
            FIXTURES / "directive.md",
        )
        self.assertNotIn("focal vocabulary", r.stdout)
        self.assertIn("note: file directive suppressed lexicon rules", r.stdout)
        self.assertEqual(hits(r.stdout, "em dashes"), 1, r.stdout)
        self.assertIn("[FLAG]", row(r.stdout, "em dashes"), r.stdout)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)

    def test_overlay_drop_suppresses_entry(self):
        path = FIXTURES / "one_tell.md"
        bare = run(path)
        self.assertEqual(bare.returncode, 1, bare.stdout + bare.stderr)
        r = run("--overlay", OVERLAYS / "drop_delve.lex", path)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_overlay_demote_moves_hit_to_soft(self):
        r = run(
            "-v", "--overlay", OVERLAYS / "demote_delve.lex",
            FIXTURES / "one_tell.md",
        )
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(hits(r.stdout, "soft focal"), 1)

    def test_overlays_apply_in_order(self):
        path = FIXTURES / "clean.md"
        a = OVERLAYS / "order_a.lex"
        b = OVERLAYS / "order_b.lex"
        dropped = run("--overlay", a, "--overlay", b, path)
        self.assertEqual(dropped.returncode, 0, dropped.stdout + dropped.stderr)
        added = run("--overlay", b, "--overlay", a, path)
        self.assertEqual(added.returncode, 1, added.stdout + added.stderr)

    def test_add_replaces_existing_text(self):
        r = run(
            "-v", "--overlay", OVERLAYS / "replace_delve.lex",
            FIXTURES / "one_tell.md",
        )
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(hits(r.stdout, "focal vocabulary"), 0)
        self.assertEqual(hits(r.stdout, "soft focal"), 1)

    def test_parse_error_exits_2_names_line(self):
        r = run(
            "--overlay", OVERLAYS / "bad_class.lex",
            FIXTURES / "clean.md",
        )
        self.assertEqual(r.returncode, 2)
        self.assertIn("bad_class.lex:3:", r.stderr)
        self.assertIn("unknown class or directive 'urgent'", r.stderr)

    def test_empty_overlay_noop(self):
        path = FIXTURES / "clean.md"
        bare = run(path)
        empty = run("--overlay", "/dev/null", path)
        self.assertEqual(empty.returncode, bare.returncode)
        self.assertEqual(empty.stdout, bare.stdout)
        self.assertEqual(empty.stderr, bare.stderr)

    def test_determinism_repeat_run(self):
        args = (
            "--overlay", OVERLAYS / "order_a.lex",
            "--overlay", OVERLAYS / "order_b.lex",
            FIXTURES / "clean.md",
        )
        first = run(*args)
        second = run(*args)
        self.assertEqual(second.returncode, first.returncode)
        self.assertEqual(second.stdout, first.stdout)
        self.assertEqual(second.stderr, first.stderr)

    def test_crlf_and_comments_parse(self):
        path = FIXTURES / "one_tell.md"
        lf = run("--overlay", OVERLAYS / "comments_lf.lex", path)
        crlf = run("--overlay", OVERLAYS / "comments_crlf.lex", path)
        self.assertEqual(crlf.returncode, lf.returncode)
        self.assertEqual(crlf.stdout, lf.stdout)
        self.assertEqual(crlf.stderr, lf.stderr)
        self.assertEqual(crlf.returncode, 0, crlf.stdout + crlf.stderr)

    def test_match_kind_semantics(self):
        # Every entry has one intended hit. The near-misses are balanced so
        # every behaviorally distinct single swap between match-kind tokens
        # changes this total (word and phrase intentionally share the same
        # bounded runtime matcher, differing only in the shape of their text).
        r = run(
            "-v", "--overlay", OVERLAYS / "kinds.lex",
            FIXTURES / "kinds.md",
        )
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertEqual(hits(r.stdout, "focal vocabulary"), 6)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: test_overlay.py <path-to-slopcheck-binary>")
    BIN = str(pathlib.Path(sys.argv.pop(1)).resolve())
    unittest.main()
