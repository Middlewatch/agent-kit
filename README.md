# agent-kit

One portable repo that is also its own install target: a global guide,
skills, pi extensions, prompt templates, tools, and the installer that binds
them into each coding agent on a machine. Think of it as a dotfiles repo for
agent harnesses. The extensions and installer target Pi; the guide and skills
are plain markdown that Claude Code and Codex read through tracked links.

`guidance/AGENTS.md` is the owner's own guide, written in first person for the
person who maintains this kit. Adopters replace it with their own and keep the
convention around it.

## Layout

```
~/agent-kit/                 the clone; every path below is written against it
  guidance/            AGENTS.md (global guide), CLAUDE.md, LOCATIONS.md,
                       seed templates (*.example), workspaces/ (overlays)
  skills/              one directory per skill, plus AUTHORING.md and the index
  prompts/             prompt templates (/prompt picker library)
  extensions/          pi extensions (see extensions/README.md)
  tools/               sess, prefixdiff, portaudit, introspect-scan
  bin/                 install, check (--lint, --scan), hooks/, lint-exempt.txt
  pi/                  PI_CODING_AGENT_DIR: tracked AGENTS.md link, pi state untracked
  claude/              CLAUDE_CONFIG_DIR: tracked CLAUDE.md and skills links
  codex/               CODEX_HOME: tracked AGENTS.md and skills links
  wiki/ inbox/ journals/ reference/ projects/   bindings, made by bin/install
  MACHINE.md system-tools-index.md verification-toolbox.md   machine files
  deployments.json     root, bindings, harnesses, links, tools; bin/install reads it
  package.json         pi package manifest: extensions, prompts, skills
  docs/                adr/ (decision records) and specs/ (completed build specs)
  tests/               test_check.py and the fixture kit it installs
```

Pi loads the kit as a local-path package (`~/agent-kit` in
`pi/settings.json`), which gives it the extensions, prompts, and skills
without copying. Claude Code and Codex read the guide and skills through the
links in their harness directories. Each harness directory tracks only those
links; its `.gitignore` keeps credentials, sessions, caches, and settings out.

Bindings are symlinks at the root, one per named location (`wiki`, `inbox`,
`journals`, `reference`, `projects`), pointing wherever that location lives on
the machine. Agents refer to `~/agent-kit/wiki` and never to where it
resolves, so one instruction set works on every machine.
`guidance/LOCATIONS.md` states what each binding holds and its write contract.

## Install

```bash
git clone https://github.com/Middlewatch/agent-kit.git ~/agent-kit
~/agent-kit/bin/install
```

The clone must land at `~/agent-kit`: every reference in the guide, skills,
and docs is written against that path and `bin/install` refuses another
location. Add `--bind name=/path` when a binding does not use its default
path under `$HOME` (`~/wiki` with an `inbox/` inside, `~/journals`,
`~/reference`, `~/projects`); every binding source must exist before the
install, since the installer links to directories rather than creating them.

### Environment

Each harness finds its directory through an environment variable. Set these
where your login environment lives (`~/.config/environment.d`, a shell rc, or
a dotfiles manager) and start a fresh session:

```
PI_CODING_AGENT_DIR=$HOME/agent-kit/pi
CLAUDE_CONFIG_DIR=$HOME/agent-kit/claude
CODEX_HOME=$HOME/agent-kit/codex
```

`bin/check` fails when a variable points elsewhere and warns when one is
unset. `PI_CODING_AGENT_SESSION_DIR` can keep pi's transcripts out of the
checkout (they are gitignored either way).

### What the installer changes

`bin/install` requires bash 4+, GNU coreutils (`realpath -m`), python3, and
npm for extensions that carry a lockfile. It:

1. checks the clone sits at the manifest root, `~/agent-kit`;
2. creates the bindings at the root;
3. migrates the previous layout: the contents of `~/.agents`, `~/.pi/agent`,
   `~/.claude`, and `~/.codex` move into the root and the harness
   directories, symlinks of the old layout are dropped (the tracked tree
   provides them), and the emptied dot-directories are removed;
4. links the `projects` overlay into the `projects` binding;
5. builds each tool whose toolchain is on PATH and links it into
   `~/.local/bin` (a missing toolchain reports `skipped`);
6. runs `npm ci` in each extension that has a lockfile and no `node_modules`;
7. registers `~/agent-kit` in `pi/settings.json` and drops the package entries
   the kit replaces;
8. runs `bin/check`.

A real file or directory in the way of an owned link, and a migrated entry
whose destination already exists, move to
`${XDG_STATE_HOME:-~/.local/state}/agent-kit/backup/<stamp>/<path>`. A wrong
or dangling symlink is replaced. `--dry-run` prints the plan and touches
nothing. Use `--rebind` to replace an existing binding. A missing binding
source is reported and the script exits 1 after attempting the independent
steps.

### Updating

`git pull --ff-only` updates the guide, skills, prompts, and extension source
in place; rerun `bin/install` afterwards so rebuilt tools, new extension
dependencies, and new bindings land too. The script is idempotent, so
`git pull --ff-only && bin/install` is the safe habit on every machine.

## Gates

`bin/check` verifies the installed state. `bin/check --lint` fails on any
absolute home-directory path in the tracked tree and, when the untracked
`bin/forbidden.local.txt` exists, on every pattern it lists (machine names,
sibling checkouts, personal identifiers). `bin/check --scan <repo>...` applies
the same pattern file to other repos bound for publication.
`bin/forbidden.local.txt.example` shows the format.
`python3 tests/test_check.py` exercises the installer and checker against the
fixture kit in a temporary HOME.

Machine facts (hostname, mounts, hardware, extra roots) go in the untracked
`~/agent-kit/MACHINE.md`, copied by hand from `guidance/MACHINE.md.example`;
`guidance/README.md` lists the other seed templates. The guide also leans on
content outside the kit by design: the knowledge base in the `wiki` binding,
session capture in `journals` (written by the separately installed
`autojournal` extension, which also supplies the `memory_search` tool), and
the coding-language packs in `reference`.
