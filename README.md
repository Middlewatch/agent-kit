# agent-kit

One portable repo behind the `~/.agents` convention: a global guide, skills,
pi extensions, prompt templates, tools, and the installer that links them into
each coding agent on a machine. The extensions and installer target Pi; the
guide and skills are plain markdown that Claude Code and Codex read through
the same links.

`guidance/AGENTS.md` is the owner's own guide, written in first person for the
person who maintains this kit. Adopters replace it with their own and keep the
convention around it.

## Install

### Pi-managed machine

Use this form on a machine that consumes the kit and should receive updates
through `pi update --extensions`:

```bash
pi install npm:@middlewatch/pi-agent-kit
KIT="$HOME/.pi/agent/npm/node_modules/@middlewatch/pi-agent-kit"

# When wiki, journals, reference, and projects already exist at their default
# paths under $HOME (~/wiki with an inbox/ inside, ~/journals, ~/reference,
# ~/projects):
"$KIT/bin/install"

# Or bind them to their locations on this machine:
"$KIT/bin/install" \
  --bind wiki=/path/to/wiki \
  --bind journals=/path/to/journals \
  --bind reference=/path/to/reference \
  --bind projects=/path/to/projects
```

`pi install git:github.com/Middlewatch/agent-kit` is the equivalent Git form;
its clone lands under `$HOME/.pi/agent/git/github.com/Middlewatch/agent-kit`.
Either way `pi install` registers the Pi package, and `bin/install` completes
the cross-client links and tool deployment. Restart Pi after the script passes.

Pi loads the extensions, prompt templates, and the one nested skill variant
from the package manifest; the rest of the skills reach Pi through the
`~/.agents/skills` link that `bin/install` makes. A `pi install` without
`bin/install` gives you the extensions and prompts only.

### Development checkout

Use a normal clone on the machine where the kit itself is edited:

```bash
git clone https://github.com/Middlewatch/agent-kit.git ~/projects/agent-kit
~/projects/agent-kit/bin/install
```

This form registers `~/.agents/kit` as Pi's local-path package. Add the same
`--bind name=/path` arguments when a binding does not use its default path.
Every binding source must exist before the install: the installer links to
directories and reports a missing one as a failure rather than creating it.

### What the installer changes

`bin/install` requires bash 4+, GNU coreutils (`realpath -m`), and python3. It:

1. creates `~/.agents/` and the bindings (`kit` → the clone, `wiki` →
   `~/wiki`, `inbox` → `~/wiki/inbox`, `journals` → `~/journals`,
   `reference` → `~/reference`, and `projects` → `~/projects`);
2. links `~/.agents/AGENTS.md`, `~/.agents/CLAUDE.md`, and
   `~/.agents/skills` into the kit, then links each client onto those paths
   (Pi: `~/.pi/agent/AGENTS.md`; Claude Code: `~/.claude/CLAUDE.md` and
   `~/.claude/skills`; Codex: `~/.codex/AGENTS.md` and `~/.codex/skills`);
3. moves copied resources from the retired Pi collection to the backup,
   without touching standalone Pi resources under other names;
4. builds each tool whose toolchain is on PATH and links it into
   `~/.local/bin` (a missing toolchain reports `skipped`);
5. registers the kit package if the selected install form has not already done
   so, and drops the split package entries the kit replaces;
6. runs `bin/check`.

A real file or directory in the way of an owned link, plus each known legacy
Pi resource named in `deployments.json`, moves to
`~/.agents/backup/<stamp>/<path>`. A wrong or dangling symlink is replaced.
`--dry-run` prints the plan and touches nothing. Use `--rebind` to replace an
existing binding. During a real install, a missing binding source is reported
and the script exits 1 after attempting the independent steps.

`bin/check` verifies the installed state, including the absence of those legacy
Pi resources. `bin/check --lint` fails on any absolute home-directory path in the
tracked tree and, when the untracked `bin/forbidden.local.txt` exists, on every
pattern it lists (machine names, sibling checkouts, personal identifiers).
`bin/check --scan <repo>...` applies the same pattern file to other repos bound
for publication. `bin/forbidden.local.txt.example` shows the format.

Machine facts (hostname, mounts, hardware, extra roots) go in the untracked
`~/.agents/MACHINE.md`, copied by hand from `guidance/MACHINE.md.example`;
`guidance/README.md` lists the other seed templates. The guide also leans on
content outside the kit by design: the knowledge base in the `wiki` binding,
session capture in `journals` (written by the separately installed
`autojournal` extension, which also supplies the `memory_search` tool), and
the coding-language packs in `reference`.

## The `~/.agents` convention

`~/.agents/` is a flat directory of named symlinks. Agents refer to
`~/.agents/kit`, `~/.agents/wiki`, `~/.agents/reference`,
`~/.agents/projects` and never to where those resolve, so one instruction set
works on every machine. Pi reads `~/.agents/skills` natively; Claude Code and
Codex are linked onto it. `guidance/LOCATIONS.md` states what each binding
holds and the write contract for it.

## Layout

```
AGENTS.md            repo charter
CHANGELOG.md         release notes
deployments.json     bindings, client links, tool table; bin/install reads it
package.json         pi package manifest: extensions, prompts, the nested skill variant
bin/install          installer           bin/check    verifier, --lint, --scan
bin/hooks/           git hooks for a development checkout (pre-push runs the gates)
bin/lint-exempt.txt  history dirs the lint skips
docs/                adr/ (decision records) and specs/ (completed build specs)
guidance/            AGENTS.md (global guide), CLAUDE.md, LOCATIONS.md,
                     seed templates (*.example), workflows/ (charters),
                     workspaces/ (overlays), sysprompt/ (system prompt templates)
skills/              one directory per skill, plus AUTHORING.md and the index
prompts/             prompt templates (/prompt picker library)
extensions/          pi extensions: pi-interlock, pi-scratchpad, agent-delegate,
                     pageview, todo, pi-tui, prompt-picker, pi-config,
                     sysprompt-editor
tools/               sess, prefixdiff, portaudit, lemonade-hub-sync, introspect-scan
tests/               test_check.py and the fixture kit it installs
```

## Forks and alternate remotes

A fork edits the `pi_package` forms in `deployments.json` to include its own
npm or Git source. This lets `bin/install` recognize the package that
`pi install` already registered instead of adding a second local-path entry.
