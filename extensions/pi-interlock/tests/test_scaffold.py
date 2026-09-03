"""Repository integrity: every tracked file has one design owner and current links resolve."""

from fnmatch import fnmatchcase
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OWNERSHIP_PATTERNS = (
    ".prettierignore",
    "DESIGN.md",
    "INTAKE.md",
    "README.md",
    "contracts/seatbelt-v2/*.md",
    "fixtures/.gitkeep",
    "fixtures/fuzz/*.json",
    "fixtures/seatbelt-v2/*.json",
    "fixtures/seatbelt-v2/*.jsonl",
    "index.ts",
    "package-lock.json",
    "package.json",
    "scripts/*.sh",
    "src/*.ts",
    "tests/*.py",
    "tests/*.ts",
    "tsconfig.json",
)


class TestDesignOwnership(unittest.TestCase):
    def test_every_publishable_file_has_one_design_owner(self):
        result = subprocess.run(
            [
                "git",
                "ls-files",
                "--cached",
                "--others",
                "--exclude-standard",
                "--",
                ".",
            ],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        paths = [line for line in result.stdout.splitlines() if line]
        ownership = {
            path: [
                pattern
                for pattern in OWNERSHIP_PATTERNS
                if fnmatchcase(path, pattern)
            ]
            for path in paths
        }
        self.assertEqual(
            {path: owners for path, owners in ownership.items() if len(owners) != 1},
            {},
            "every publishable project file must have exactly one concept-map owner",
        )

        design = (ROOT / "DESIGN.md").read_text()
        undocumented = [
            pattern
            for pattern in OWNERSHIP_PATTERNS
            if f"`{pattern}`" not in design
        ]
        self.assertEqual(
            undocumented,
            [],
            "every enforced ownership pattern must appear in DESIGN.md",
        )

    def test_current_document_links_resolve(self):
        missing = []
        for name in ("README.md", "DESIGN.md"):
            text = (ROOT / name).read_text()
            for target in re.findall(r"\[[^]]+\]\(([^)]+)\)", text):
                path = target.split("#", 1)[0]
                if not path or "://" in path:
                    continue
                if not (ROOT / path).exists():
                    missing.append(f"{name}: {target}")
        self.assertEqual(missing, [], "current local documentation links must resolve")


if __name__ == "__main__":
    unittest.main()
