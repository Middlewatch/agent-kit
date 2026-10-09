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
HARNESS_ENV = {"pi": "PI_CODING_AGENT_DIR", "claude": "CLAUDE_CONFIG_DIR", "codex": "CODEX_HOME"}


def lint_repo(repo: Path) -> None:
    """A minimal git repo holding only the lint (bin/) so the baseline is clean."""
    shutil.copytree(ROOT / "bin", repo / "bin", ignore=shutil.ignore_patterns("__pycache__", "forbidden.local.txt"))
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)


class Home:
    """A temp HOME with a private copy of the fixture kit at ~/agent-kit and source dirs."""

    def __init__(self, *, make_sources=("wiki", "reference", "projects"), zig=True, kit_name="agent-kit"):
        self.dir = Path(tempfile.mkdtemp(prefix="agent-kit-test-"))
        self.kit = self.dir / kit_name
        shutil.copytree(FIXTURE_KIT, self.kit, symlinks=True)
        for name in make_sources:
            (self.dir / name).mkdir()
        self.path = str(FAKE_BIN) + os.pathsep + os.environ["PATH"] if zig else self._path_without("zig")
        self.path = str(self.dir / ".local/bin") + os.pathsep + self.path
        self.state = self.dir / ".local/state"

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

    def env(self, harness_env=True) -> dict:
        env = {"HOME": str(self.dir), "PATH": self.path, "TMPDIR": str(self.dir), "XDG_STATE_HOME": str(self.state)}
        if harness_env:
            for name, var in HARNESS_ENV.items():
                env[var] = str(self.kit / name)
        return env

    def run(self, *args: str, path: str | None = None, env: dict | None = None) -> subprocess.CompletedProcess:
        env = dict(env if env is not None else self.env())
        if path is not None:
            env["PATH"] = path
        return subprocess.run([str(a) for a in args], capture_output=True, text=True, env=env)

    def install(self, *extra: str, binds=("wiki", "reference", "projects"), path=None, env=None):
        args = [INSTALL, "--kit", self.kit, *extra]
        for b in binds:
            args += ["--bind", f"{b}={self.dir / b}"]
        return self.run(*args, path=path, env=env)

    def check(self, *extra: str, path=None, env=None):
        return self.run(CHECK, "--kit", self.kit, *extra, path=path, env=env)

    def tree(self) -> str:
        return subprocess.run(
            ["find", str(self.kit), "-printf", "%P %y %l\n"],
            capture_output=True, text=True,
        ).stdout

    def backups(self, pattern: str) -> list[Path]:
        return list((self.state / "agent-kit/backup").glob(pattern))

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
        self.assertNotIn("WARN", r.stdout)
        for name in ("wiki", "reference", "projects"):
            self.assertEqual(os.path.realpath(h.kit / name), os.path.realpath(h.dir / name))
        self.assertTrue((h.kit / "claude/skills/demo/SKILL.md").is_file())
        self.assertTrue((h.kit / "codex/AGENTS.md").is_file())
        self.assertTrue((h.kit / "pi/AGENTS.md").is_file())
        self.assertEqual(os.readlink(h.dir / "projects/AGENTS.md"), str(h.kit / "guidance/AGENTS.md"))
        self.assertEqual(os.readlink(h.dir / "projects/CLAUDE.md"), "AGENTS.md")
        self.assertTrue((h.dir / ".local/bin/demo-built").is_file())
        settings = json.loads((h.kit / "pi/settings.json").read_text())
        self.assertEqual(settings["packages"], ["~/agent-kit"])
        for dot in (".agents", ".pi", ".claude", ".codex"):
            self.assertFalse((h.dir / dot).exists(), dot)

    def test_root_mismatch(self):
        h = self.home(kit_name="elsewhere")
        r = h.install()
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertIn(f"FAIL kit is at {h.kit}; the manifest root is {h.dir / 'agent-kit'}", r.stdout)
        self.assertFalse((h.kit / "wiki").exists(), "nothing linked before the root check passes")
        r = h.check()
        self.assertEqual(r.returncode, 1)
        self.assertIn(f"root: kit is at {h.kit}", r.stdout)

    def test_harness_env(self):
        h = self.home()
        self.assertEqual(h.install().returncode, 0)
        r = h.check(env=h.env(harness_env=False))
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("WARN: harness pi: PI_CODING_AGENT_DIR is unset", r.stdout)
        env = h.env()
        env["PI_CODING_AGENT_DIR"] = str(h.dir / ".pi/agent")
        r = h.check(env=env)
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn(f"harness pi: PI_CODING_AGENT_DIR={h.dir / '.pi/agent'}, expected {h.kit / 'pi'}", r.stdout)

    def test_migration(self):
        # The old layout: ~/.agents of installer links plus owner files, and a
        # dot-directory per harness holding links into ~/.agents beside state.
        h = self.home()
        agents = h.dir / ".agents"
        agents.mkdir()
        (agents / "kit").symlink_to(h.kit)
        (agents / "wiki").symlink_to(h.dir / "wiki")
        (agents / "AGENTS.md").symlink_to("kit/guidance/AGENTS.md")
        (agents / "MACHINE.md").write_text("machine\n")
        (agents / "backup/2026/x").mkdir(parents=True)
        pi = h.dir / ".pi/agent"
        pi.mkdir(parents=True)
        (pi / "AGENTS.md").symlink_to(agents / "AGENTS.md")
        (pi / "auth.json").write_text("{}\n")
        (pi / "sessions/a").mkdir(parents=True)
        (pi / "settings.json").write_text(json.dumps({"theme": "dark", "packages": ["~/.agents/kit", "npm:other"]}))
        claude = h.dir / ".claude"
        claude.mkdir()
        (claude / "CLAUDE.md").symlink_to(agents / "CLAUDE.md")
        (claude / "skills").symlink_to(agents / "skills")
        (claude / ".credentials.json").write_text("secret\n")
        (claude / "hooks").mkdir()
        (claude / "elsewhere").symlink_to(h.dir / "wiki")
        codex = h.dir / ".codex"
        codex.mkdir()
        (codex / "AGENTS.md").symlink_to(agents / "AGENTS.md")
        (codex / "auth.json").write_text("{}\n")

        dry = h.install("--dry-run")
        self.assertEqual(dry.returncode, 0, dry.stdout + dry.stderr)
        self.assertIn(f"migrate {pi / 'auth.json'} -> {h.kit / 'pi/auth.json'}", dry.stdout)
        self.assertIn(f"drop    {claude / 'skills'} ->", dry.stdout)
        self.assertTrue((pi / "auth.json").is_file())
        self.assertTrue(agents.is_dir())

        r = h.install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        for dot in (agents, h.dir / ".pi", claude, codex):
            self.assertFalse(dot.exists(), f"{dot} remains")
        self.assertTrue((h.kit / "pi/auth.json").is_file())
        self.assertTrue((h.kit / "pi/sessions/a").is_dir())
        self.assertTrue((h.kit / "claude/.credentials.json").is_file())
        self.assertTrue((h.kit / "claude/hooks").is_dir())
        self.assertEqual(os.readlink(h.kit / "claude/elsewhere"), str(h.dir / "wiki"), "foreign symlinks move")
        self.assertEqual(os.readlink(h.kit / "claude/skills"), "../skills", "tracked link untouched")
        self.assertTrue((h.kit / "codex/auth.json").is_file())
        self.assertEqual((h.kit / "MACHINE.md").read_text(), "machine\n")
        self.assertTrue((h.state / "agent-kit/backup/2026/x").is_dir())
        settings = json.loads((h.kit / "pi/settings.json").read_text())
        self.assertEqual(settings["theme"], "dark")
        self.assertEqual(settings["packages"], ["npm:other", "~/agent-kit"])
        self.assertEqual(h.check().returncode, 0)

    def test_migration_collision(self):
        h = self.home()
        claude = h.dir / ".claude"
        claude.mkdir()
        (claude / "settings.json").write_text("old\n")
        (h.kit / "claude/settings.json").write_text("new\n")
        r = h.install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual((h.kit / "claude/settings.json").read_text(), "new\n")
        self.assertEqual(len(h.backups("*/.claude/settings.json")), 1, r.stdout)
        self.assertFalse(claude.exists())

    def test_legacy_dir_fails_check(self):
        h = self.home()
        self.assertEqual(h.install().returncode, 0)
        (h.dir / ".agents").mkdir()
        r = h.check()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn(f"legacy bindings {h.dir / '.agents'} still exist", r.stdout)

    def test_advertised_tool_off_path_warns(self):
        h = self.home()
        h.install()
        (h.kit / "system-tools-index.md").write_text(
            "# Index\n\n## Advertised\n\n- `demo-built`: on PATH\n- `no-such-tool-xyz`: not installed\n\n## Other\n\n- `also-missing`: outside the section\n"
        )
        r = h.check()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("WARN: system-tools-index: advertised but not on PATH: no-such-tool-xyz", r.stdout)
        self.assertNotIn("also-missing", r.stdout)

    def test_broken_binding(self):
        h = self.home()
        self.assertEqual(h.install().returncode, 0)
        mem = h.kit / "wiki"
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
        before = h.tree()
        r = h.install("--dry-run", binds=())
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        out = r.stdout
        for name in ("wiki", "reference", "projects"):
            self.assertIn(f"missing {name}: {h.dir / name}", out)
        self.assertIn("demo-script", out)
        self.assertIn("demo-built", out)
        self.assertIn(f"pi      add ~/agent-kit in {h.kit / 'pi/settings.json'}", out)
        self.assertEqual(before, h.tree())
        self.assertFalse((h.dir / ".local").exists())

    def test_install_idempotent(self):
        h = self.home()
        self.assertEqual(h.install().returncode, 0)
        first = h.tree()
        r = h.install()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(first, h.tree())
        self.assertFalse((h.state / "agent-kit/backup").exists())
        self.assertNotIn("replace", r.stdout)

    def test_install_collisions(self):
        h = self.home(make_sources=("reference", "projects"))
        (h.dir / "projects/AGENTS.md").write_text("real file\n")
        (h.dir / "projects/CLAUDE.md").symlink_to(h.dir / "wrong.md")
        settings = h.kit / "pi/settings.json"
        settings.write_text(json.dumps({"theme": "dark", "packages": [str(h.dir / "old-kit"), "npm:other", {"source": "npm:obj", "skills": []}]}))
        r = h.install()
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn(f"missing wiki: {h.dir / 'wiki'}", r.stdout)
        self.assertEqual(len(h.backups("*")), 1, "one backup dir per run")
        self.assertEqual(len(h.backups("*/agent-kit/projects/AGENTS.md")), 1, r.stdout)
        self.assertEqual(len(h.backups("*/agent-kit/pi/settings.json")), 1, r.stdout)
        self.assertTrue((h.dir / "projects/AGENTS.md").is_symlink())
        self.assertEqual(os.readlink(h.dir / "projects/CLAUDE.md"), "AGENTS.md")
        after = json.loads(settings.read_text())
        self.assertEqual(after["theme"], "dark")
        self.assertEqual(after["packages"], ["npm:other", {"source": "npm:obj", "skills": []}, "~/agent-kit"])
        r = h.check()
        self.assertEqual(r.returncode, 1)
        self.assertIn("binding wiki", r.stdout)

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
