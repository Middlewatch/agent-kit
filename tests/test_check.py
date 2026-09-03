#!/usr/bin/env python3
"""Tests for bin/install and bin/check against the fixture kit in a temp HOME.

Run: python3 tests/test_check.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
INSTALL = ROOT / "bin/install"
CHECK = ROOT / "bin/check"
FIXTURE_KIT = ROOT / "tests/fixtures/kit"
FAKE_BIN = ROOT / "tests/fixtures/bin"


def lint_repo(repo: Path) -> None:
    """A minimal git repo holding only the lint (bin/) so the baseline is clean."""
    shutil.copytree(ROOT / "bin", repo / "bin", ignore=shutil.ignore_patterns("__pycache__", "forbidden.local.txt"))
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)


class Home:
    """A temp HOME with a private copy of the fixture kit and source dirs."""

    def __init__(self, *, make_sources=("wiki", "reference", "projects"), zig=True):
        self.dir = Path(tempfile.mkdtemp(prefix="agent-kit-test-"))
        self.kit = self.dir / "kit"
        shutil.copytree(FIXTURE_KIT, self.kit, symlinks=True)
        for name in make_sources:
            (self.dir / name).mkdir()
        self.path = str(FAKE_BIN) + os.pathsep + os.environ["PATH"] if zig else self._path_without("zig")
        self.path = str(self.dir / ".local/bin") + os.pathsep + self.path

    def _path_without(self, prog: str) -> str:
        """A one-directory PATH mirroring every executable on the real PATH except `prog`."""
        shadow = self.dir / "shadow-bin"
        shadow.mkdir()
        for part in os.environ["PATH"].split(os.pathsep):
            d = Path(part)
            if not d.is_dir():
                continue
            for entry in d.iterdir():
                link = shadow / entry.name
                if entry.name != prog and not link.exists() and os.access(entry, os.X_OK):
                    link.symlink_to(entry)
        return str(shadow)

    def env(self) -> dict:
        return {"HOME": str(self.dir), "PATH": self.path, "TMPDIR": str(self.dir)}

    def run(self, *args: str, path: str | None = None) -> subprocess.CompletedProcess:
        env = self.env()
        if path is not None:
            env["PATH"] = path
        return subprocess.run([str(a) for a in args], capture_output=True, text=True, env=env)

    def install(self, *extra: str, binds=("wiki", "reference", "projects"), path=None):
        args = [INSTALL, "--kit", self.kit, *extra]
        for b in binds:
            args += ["--bind", f"{b}={self.dir / b}"]
        return self.run(*args, path=path)

    def check(self, *extra: str, path=None):
        return self.run(CHECK, *extra, path=path)

    def tree(self) -> str:
        return subprocess.run(
            ["find", str(self.dir / ".agents"), "-printf", "%P %y %l\n"],
            capture_output=True, text=True,
        ).stdout

    def cleanup(self):
        shutil.rmtree(self.dir, ignore_errors=True)


class InstallAndCheck(unittest.TestCase):
    def setUp(self):
        self.homes: list[Home] = []

    def tearDown(self):
        for h in self.homes:
            h.cleanup()

    def home(self, **kw) -> Home:
        h = Home(**kw)
        self.homes.append(h)
        return h

    def test_valid_fixture(self):
        h = self.home()
        r = h.install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        r = h.check()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        agents = h.dir / ".agents"
        self.assertEqual(os.path.realpath(agents / "kit"), os.path.realpath(h.kit))
        self.assertEqual(os.readlink(agents / "AGENTS.md"), "kit/guidance/AGENTS.md")
        self.assertTrue((h.dir / ".claude/skills/demo/SKILL.md").is_file())
        self.assertTrue((h.dir / ".codex/AGENTS.md").is_file())
        self.assertTrue((h.dir / ".pi/agent/AGENTS.md").is_file())
        self.assertTrue((h.dir / ".local/bin/demo-built").is_file())
        settings = json.loads((h.dir / ".pi/agent/settings.json").read_text())
        self.assertIn("~/.agents/kit", settings["packages"])

    def test_broken_binding(self):
        h = self.home()
        self.assertEqual(h.install().returncode, 0)
        mem = h.dir / ".agents/wiki"
        mem.unlink()
        mem.symlink_to(h.dir / "nowhere")
        r = h.check()
        self.assertEqual(r.returncode, 1)
        self.assertIn("binding wiki", r.stdout)

    def test_lint_seeded_path(self):
        repo = self.home().dir / "repo"
        lint_repo(repo)
        subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
        seeded = repo / "README-seed.md"
        seeded.write_text("see /home/x for details\n")
        subprocess.run(["git", "add", "README-seed.md"], cwd=repo, check=True)
        r = subprocess.run([str(repo / "bin/check"), "--lint"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("README-seed.md:1: /home/", r.stdout)
        subprocess.run(["git", "rm", "-q", "-f", "README-seed.md"], cwd=repo, check=True)
        r = subprocess.run([str(repo / "bin/check"), "--lint"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_lint_local_patterns(self):
        # Machine names live in the untracked forbidden.local.txt and lint
        # applies them case-insensitively, honouring its `!` exemptions.
        repo = self.home().dir / "repo"
        lint_repo(repo)
        (repo / "bin/forbidden.local.txt").write_text("hostbox\n!docs/*.md\n")
        (repo / "README.md").write_text("built on HostBox\n")
        (repo / "docs").mkdir()
        (repo / "docs/note.md").write_text("hostbox is expected here\n")
        subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
        r = subprocess.run([str(repo / "bin/check"), "--lint"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("README.md:1: HostBox", r.stdout)
        self.assertNotIn("docs/note.md", r.stdout)

    def test_lint_line_budget(self):
        repo = self.home().dir / "repo"
        lint_repo(repo)
        guide = repo / "guidance/AGENTS.md"
        guide.parent.mkdir(parents=True, exist_ok=True)
        guide.write_text("line\n" * 241)
        subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
        r = subprocess.run([str(repo / "bin/check"), "--lint"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("guidance/AGENTS.md: 241 lines", r.stdout)

    def test_dry_run_creates_nothing(self):
        h = self.home(make_sources=())
        empty = h.dir / "empty"
        empty.mkdir()
        env = h.env()
        env["HOME"] = str(empty)
        r = subprocess.run([str(INSTALL), "--kit", str(h.kit), "--dry-run"], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        out = r.stdout
        self.assertIn(f"link    {empty}/.agents/kit -> {h.kit}", out)
        for name in ("wiki", "reference", "projects"):
            self.assertIn(f"missing {name}: {empty}/{name}", out)
        for target in (".pi/agent/AGENTS.md", ".claude/CLAUDE.md", ".claude/skills", ".codex/AGENTS.md", ".codex/skills"):
            self.assertIn(f"{empty}/{target} ->", out)
        self.assertIn("demo-script", out)
        self.assertIn("demo-built", out)
        found = subprocess.run(["find", str(empty)], capture_output=True, text=True).stdout.split()
        self.assertEqual(found, [str(empty)])

    def test_install_idempotent(self):
        h = self.home()
        self.assertEqual(h.install().returncode, 0)
        first = h.tree()
        r = h.install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(first, h.tree())
        self.assertFalse((h.dir / ".agents/backup").exists())
        self.assertNotIn("replace", r.stdout)

    def test_install_retires_only_declared_legacy_pi_resources(self):
        h = self.home()
        legacy_extension = h.dir / ".pi/agent/extensions/old-kit"
        legacy_skill = h.dir / ".pi/agent/skills/old-plan"
        standalone = h.dir / ".pi/agent/extensions/standalone"
        legacy_extension.mkdir(parents=True)
        legacy_skill.mkdir(parents=True)
        standalone.mkdir(parents=True)
        (legacy_extension / "marker.txt").write_text("extension\n")
        (legacy_skill / "SKILL.md").write_text("skill\n")
        (standalone / "index.ts").write_text("standalone\n")

        dry = h.install("--dry-run")
        self.assertEqual(dry.returncode, 0, dry.stdout + dry.stderr)
        self.assertIn(f"retire  {legacy_extension}", dry.stdout)
        self.assertIn(f"retire  {legacy_skill}", dry.stdout)
        self.assertTrue(legacy_extension.is_dir())
        self.assertTrue(legacy_skill.is_dir())

        r = h.install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertFalse(legacy_extension.exists())
        self.assertFalse(legacy_skill.exists())
        self.assertTrue(standalone.is_dir())
        backup = h.dir / ".agents/backup"
        self.assertEqual(len(list(backup.glob("*/.pi/agent/extensions/old-kit/marker.txt"))), 1)
        self.assertEqual(len(list(backup.glob("*/.pi/agent/skills/old-plan/SKILL.md"))), 1)
        self.assertEqual(h.check().returncode, 0)

        legacy_skill.mkdir()
        check = h.check()
        self.assertEqual(check.returncode, 1, check.stdout)
        self.assertIn(f"legacy Pi resource {legacy_skill}", check.stdout)

    def test_install_collisions(self):
        h = self.home(make_sources=("reference", "projects"))
        real = h.dir / ".claude/skills"
        real.mkdir(parents=True)
        (real / "old.txt").write_text("keep me\n")
        (h.dir / ".claude/CLAUDE.md").write_text("real file\n")
        (h.dir / ".codex").mkdir()
        (h.dir / ".codex/AGENTS.md").symlink_to(h.dir / "wrong.md")
        settings = h.dir / ".pi/agent/settings.json"
        settings.parent.mkdir(parents=True)
        settings.write_text(json.dumps({"theme": "dark", "packages": [str(h.dir / "old-kit"), "npm:other", {"source": "npm:obj", "skills": []}]}))
        r = h.install()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn(f"missing wiki: {h.dir / 'wiki'}", r.stdout)
        backup = h.dir / ".agents/backup"
        self.assertEqual(len(list(backup.iterdir())), 1, "one backup dir per run")
        self.assertEqual(len(list(backup.glob("*/.claude/skills/old.txt"))), 1, r.stdout)
        self.assertEqual(len(list(backup.glob("*/.claude/CLAUDE.md"))), 1, r.stdout)
        self.assertEqual(len(list(backup.glob("*/.pi/agent/settings.json"))), 1, r.stdout)
        self.assertTrue((h.dir / ".claude/skills").is_symlink())
        self.assertTrue((h.dir / ".claude/CLAUDE.md").is_symlink())
        after = json.loads(settings.read_text())
        self.assertEqual(after["theme"], "dark")
        self.assertEqual(after["packages"], ["npm:other", {"source": "npm:obj", "skills": []}, "~/.agents/kit"])
        self.assertEqual(os.path.realpath(h.dir / ".codex/AGENTS.md"), os.path.realpath(h.kit / "guidance/AGENTS.md"))
        r = h.check()
        self.assertEqual(r.returncode, 1)
        self.assertIn("binding wiki", r.stdout)

    def test_git_package_form_counts(self):
        h = self.home()
        settings = h.dir / ".pi/agent/settings.json"
        settings.parent.mkdir(parents=True)
        settings.write_text(json.dumps({"packages": ["git:example.com/fixture-kit"]}))
        r = h.install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(json.loads(settings.read_text())["packages"], ["git:example.com/fixture-kit"])
        self.assertEqual(h.check().returncode, 0)

    def test_git_package_pinned_ref(self):
        # Pi identifies git packages by URL without the ref; a pinned install
        # still counts as the kit package (no duplicate ~/.agents/kit entry).
        h = self.home()
        settings = h.dir / ".pi/agent/settings.json"
        settings.parent.mkdir(parents=True)
        settings.write_text(json.dumps({"packages": ["git:example.com/fixture-kit@v1.2"]}))
        r = h.install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(json.loads(settings.read_text())["packages"], ["git:example.com/fixture-kit@v1.2"])
        self.assertEqual(h.check().returncode, 0)

    def test_skipped_tool(self):
        h = self.home(zig=False)
        r = h.install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("skipped demo-built: zig not found", r.stdout)
        self.assertFalse((h.dir / ".local/bin/demo-built").exists())
        self.assertEqual(h.check().returncode, 0)
        with_zig = str(FAKE_BIN) + os.pathsep + h.path
        r = h.check(path=with_zig)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("tool demo-built", r.stdout)
        self.assertEqual(h.install(path=with_zig).returncode, 0)
        self.assertEqual(h.check(path=with_zig).returncode, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
