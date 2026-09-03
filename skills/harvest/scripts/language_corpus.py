#!/usr/bin/env python3
"""Initialize, resolve, and validate language packs."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path.home() / "reference/coding-languages"
SCHEMA_VERSION = 1
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REQUIRED_DIRS = ("references", "adjudications")
REQUIRED_FILES = ("manifest.json", "CONVENTIONS.md", "HARVEST_LOG.md")


def frontmatter(language: str) -> str:
    return f"---\nprivacy: cloud_ok\nlanguage: {language}\n---\n\n"


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"{path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return value


def safe_child(base: Path, relative: Any, label: str) -> Path:
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute() or ".." in Path(relative).parts:
        raise ValueError(f"{label}: expected a safe relative path")
    base_resolved = base.resolve()
    candidate = (base / relative).resolve()
    if not candidate.is_relative_to(base_resolved):
        raise ValueError(f"{label}: path escapes {base}")
    return candidate


def write_registry(root: Path, packs: list[dict[str, Any]]) -> None:
    payload = {"schema_version": SCHEMA_VERSION, "packs": sorted(packs, key=lambda p: p["slug"])}
    (root / "registry.json").write_text(json.dumps(payload, indent=2) + "\n")


def register(root: Path, manifest: dict[str, Any]) -> None:
    registry_path = root / "registry.json"
    registry = load_json(registry_path) if registry_path.exists() else {"schema_version": SCHEMA_VERSION, "packs": []}
    packs = [p for p in registry.get("packs", []) if isinstance(p, dict) and p.get("slug") != manifest["slug"]]
    packs.append({
        "language": manifest["language"],
        "slug": manifest["slug"],
        "status": manifest["status"],
        "aliases": manifest["aliases"],
        "path": manifest["slug"],
    })
    write_registry(root, packs)


def init_pack(root: Path, language: str, slug: str, toolchain: str | None) -> Path:
    if not language.strip():
        raise ValueError("language must not be empty")
    if not SLUG_RE.fullmatch(slug):
        raise ValueError("slug must be lowercase ASCII words separated by single hyphens")
    root.mkdir(parents=True, exist_ok=True)
    pack = root / slug
    if pack.exists():
        raise ValueError(f"pack already exists: {pack}")
    for directory in REQUIRED_DIRS:
        (pack / directory).mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "language": language,
        "slug": slug,
        "status": "candidate",
        "aliases": [slug],
        "toolchains": [toolchain] if toolchain else [],
        "active_conventions": "CONVENTIONS.md",
        "version_references": [],
    }
    (pack / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (pack / "CONVENTIONS.md").write_text(frontmatter(language) + f"# {language} conventions (earned)\n\nNo active rules yet. Promote only adjudicated lessons backed by a completed build or review.\n")
    (pack / "HARVEST_LOG.md").write_text(frontmatter(language) + f"# Harvest ledger — {slug}\n\nAppend-only. One line per adjudicated candidate: `date | action | rule-or-slug | evidence | ruling`.\n")
    (pack / "adjudications/README.md").write_text(frontmatter(language) + "# Adjudications\n\nDated accept/edit/reject snapshots. Append new snapshots; do not rewrite old rulings.\n")
    (pack / "references/README.md").write_text(frontmatter(language) + "# References\n\nVersion-specific API maps and detailed evidence-backed patterns live here.\n")
    register(root, manifest)
    return pack


def validate_pack(pack: Path) -> list[str]:
    errors: list[str] = []
    for name in REQUIRED_FILES:
        if not (pack / name).is_file():
            errors.append(f"{pack}: missing {name}")
    for name in REQUIRED_DIRS:
        directory = pack / name
        if directory.is_symlink() or not directory.is_dir():
            errors.append(f"{pack}: missing or symlinked directory {name}")
    if errors:
        return errors
    try:
        manifest = load_json(pack / "manifest.json")
    except ValueError as exc:
        return [str(exc)]
    required = {"schema_version", "language", "slug", "status", "aliases", "toolchains", "active_conventions", "version_references"}
    missing = sorted(required - manifest.keys())
    if missing:
        return [f"{pack}/manifest.json: missing {', '.join(missing)}"]
    if manifest["schema_version"] != SCHEMA_VERSION:
        errors.append(f"{pack}: unsupported schema_version {manifest['schema_version']}")
    if not isinstance(manifest["language"], str) or not manifest["language"]:
        errors.append(f"{pack}: language must be a non-empty string")
    if not isinstance(manifest["slug"], str) or manifest["slug"] != pack.name or not SLUG_RE.fullmatch(manifest["slug"]):
        errors.append(f"{pack}: manifest slug does not match directory")
    if not isinstance(manifest["status"], str) or manifest["status"] not in {"candidate", "active", "retired"}:
        errors.append(f"{pack}: invalid status {manifest['status']!r}")
    for key in ("aliases", "toolchains"):
        if not isinstance(manifest[key], list) or not all(isinstance(item, str) and item for item in manifest[key]):
            errors.append(f"{pack}: {key} must be an array of non-empty strings")
    references = manifest["version_references"]
    if not isinstance(references, list):
        errors.append(f"{pack}: version_references must be an array")
        references = []
    try:
        active = safe_child(pack, manifest["active_conventions"], f"{pack}: active_conventions")
        if not active.is_file():
            errors.append(f"{pack}: active conventions file does not exist: {active.name}")
    except ValueError as exc:
        errors.append(str(exc))
    for path in pack.rglob("*.md"):
        if path.is_file() and not path.read_text().startswith("---\nprivacy: "):
            errors.append(f"{path}: missing privacy frontmatter")
    for item in references:
        if not isinstance(item, dict) or set(item) != {"toolchain", "path"} or not isinstance(item.get("toolchain"), str):
            errors.append(f"{pack}: malformed version reference")
            continue
        try:
            path = safe_child(pack, item.get("path"), f"{pack}: version reference")
            if not path.is_file():
                errors.append(f"{pack}: missing version reference {item['path']}")
        except ValueError as exc:
            errors.append(str(exc))
    errors.extend(validate_both_ends(pack, manifest))
    return errors


def validate_both_ends(pack: Path, manifest: dict[str, Any]) -> list[str]:
    """A detailed reference teaches a pattern; an example proves it still compiles.

    Both keys are optional so an evidence-empty or young pack validates, but a
    pack that declares either one must keep it honest: paths resolve, every
    example names the reference it verifies, and a declared example is pinned to
    a toolchain the manifest knows about.
    """
    errors: list[str] = []
    examples = manifest.get("examples", [])
    detailed = manifest.get("detailed_references", [])
    if not isinstance(examples, list):
        return [f"{pack}: examples must be an array"]
    if not isinstance(detailed, list):
        return [f"{pack}: detailed_references must be an array"]

    example_paths: set[str] = set()
    for item in examples:
        if not isinstance(item, dict):
            errors.append(f"{pack}: malformed example entry")
            continue
        missing = sorted({"path", "verifies", "command", "last_green", "toolchain"} - item.keys())
        if missing:
            errors.append(f"{pack}: example {item.get('path', '?')} missing {', '.join(missing)}")
            continue
        try:
            path = safe_child(pack, item["path"], f"{pack}: example")
            if not path.is_file():
                errors.append(f"{pack}: missing example file {item['path']}")
            else:
                example_paths.add(item["path"])
        except ValueError as exc:
            errors.append(str(exc))
            continue
        if item["toolchain"] not in manifest.get("toolchains", []):
            errors.append(
                f"{pack}: example {item['path']} pins toolchain {item['toolchain']!r},"
                f" which is not in manifest toolchains"
            )
        if not DATE_RE.fullmatch(str(item["last_green"])):
            errors.append(f"{pack}: example {item['path']} last_green must be YYYY-MM-DD")
        try:
            verified = safe_child(pack, item["verifies"], f"{pack}: example verifies")
            if not verified.is_file():
                errors.append(f"{pack}: example {item['path']} verifies missing {item['verifies']}")
        except ValueError as exc:
            errors.append(str(exc))

    for item in detailed:
        if not isinstance(item, dict) or not isinstance(item.get("topic"), str) or not item.get("topic"):
            errors.append(f"{pack}: detailed reference needs a non-empty topic")
            continue
        try:
            path = safe_child(pack, item.get("path"), f"{pack}: detailed reference")
            if not path.is_file():
                errors.append(f"{pack}: missing detailed reference {item.get('path')}")
        except ValueError as exc:
            errors.append(str(exc))
            continue
        example = item.get("example")
        if example is not None and example not in example_paths:
            errors.append(
                f"{pack}: detailed reference {item['path']} names example {example!r},"
                f" which is not a declared, existing example"
            )
    return errors


def valid_registry_entry(entry: Any) -> bool:
    return (
        isinstance(entry, dict)
        and set(entry) == {"language", "slug", "status", "aliases", "path"}
        and all(isinstance(entry[key], str) and entry[key] for key in ("language", "slug", "status", "path"))
        and isinstance(entry["aliases"], list)
        and all(isinstance(alias, str) and alias for alias in entry["aliases"])
    )


def validate_index(root: Path, packs: list[dict[str, Any]]) -> list[str]:
    """The index rots independently of the packs: twice its validator path went
    stale, and the pack table has lagged the registry. Check both against reality."""
    index = root / "index.md"
    if not index.is_file():
        return []
    text = index.read_text()
    errors: list[str] = []
    for entry in packs:
        if f"| {entry['language']} |" not in text:
            errors.append(f"{index}: pack {entry['slug']} missing from the pack table")
    for token in re.findall(r"~/[\w./@-]+", text):
        if not Path(token.rstrip(".")).expanduser().exists():
            errors.append(f"{index}: dead path {token}")
    return errors


def validate_root(root: Path) -> list[str]:
    try:
        registry = load_json(root / "registry.json")
    except ValueError as exc:
        return [str(exc)]
    if set(registry) != {"schema_version", "packs"} or registry.get("schema_version") != SCHEMA_VERSION or not isinstance(registry.get("packs"), list):
        return [f"{root}/registry.json: invalid registry schema"]
    errors: list[str] = []
    seen: set[str] = set()
    claimed_names: dict[str, str] = {}
    for entry in registry["packs"]:
        if not valid_registry_entry(entry):
            errors.append(f"{root}/registry.json: malformed pack entry")
            continue
        slug = entry["slug"]
        if entry["status"] not in {"candidate", "active", "retired"}:
            errors.append(f"{root}/registry.json: invalid status for {slug}")
        if slug in seen:
            errors.append(f"{root}/registry.json: duplicate slug {slug}")
        seen.add(slug)
        for name in [entry["language"], slug, *entry["aliases"]]:
            folded = name.casefold()
            if folded in claimed_names and claimed_names[folded] != slug:
                errors.append(f"{root}/registry.json: name {name!r} claimed by {claimed_names[folded]} and {slug}")
            claimed_names[folded] = slug
        try:
            pack = safe_child(root, entry["path"], f"registry pack {slug}")
        except ValueError as exc:
            errors.append(str(exc))
            continue
        errors.extend(validate_pack(pack))
        if (pack / "manifest.json").is_file():
            try:
                manifest = load_json(pack / "manifest.json")
            except ValueError as exc:
                errors.append(str(exc))
                continue
            for key in ("language", "slug", "status", "aliases"):
                if entry[key] != manifest.get(key):
                    errors.append(f"{slug}: registry/manifest mismatch for {key}")
    errors.extend(validate_index(root, [e for e in registry["packs"] if valid_registry_entry(e)]))
    return errors


def resolve(root: Path, name: str, include_candidate: bool = False) -> Path:
    registry = load_json(root / "registry.json")
    if not isinstance(registry.get("packs"), list):
        raise ValueError(f"{root}/registry.json: invalid packs")
    needle = name.casefold()
    matches: list[dict[str, Any]] = []
    for entry in registry["packs"]:
        if not valid_registry_entry(entry):
            raise ValueError(f"{root}/registry.json: malformed pack entry")
        allowed = entry["status"] == "active" or (include_candidate and entry["status"] == "candidate")
        names = [entry["language"], entry["slug"], *entry["aliases"]]
        if allowed and needle in {value.casefold() for value in names}:
            matches.append(entry)
    if len(matches) != 1:
        qualifier = "active or candidate" if include_candidate else "active"
        raise ValueError(f"expected one {qualifier} language pack for {name!r}, found {len(matches)}")
    return safe_child(root, matches[0]["path"], f"registry pack {matches[0]['slug']}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init")
    init.add_argument("--language", required=True)
    init.add_argument("--slug", required=True)
    init.add_argument("--toolchain")
    sub.add_parser("validate")
    get = sub.add_parser("resolve")
    get.add_argument("language")
    get.add_argument("--include-candidate", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "init":
            print(init_pack(args.root, args.language, args.slug, args.toolchain))
        elif args.command == "validate":
            errors = validate_root(args.root)
            if errors:
                print("\n".join(f"ERROR {error}" for error in errors), file=sys.stderr)
                return 1
            registry = load_json(args.root / "registry.json")
            print(f"PASS {len(registry['packs'])} language pack(s)")
        elif args.command == "resolve":
            print(resolve(args.root, args.language, args.include_candidate))
    except (TypeError, ValueError) as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
