# Contributing

This repository is a working agent kit first and a shared artifact second, so
the bar for changes is that they keep the installed kit honest.

## Setup

```bash
git clone https://github.com/Middlewatch/agent-kit.git
cd agent-kit
git config core.hooksPath bin/hooks   # pre-push runs the gates below
bin/install --dry-run                 # shows what a real install would link
```

`bin/install` needs bash 4+, GNU coreutils, and python3. Zig 0.16.0 builds the
compiled tools; without it they report `skipped` and everything else installs.
Extension tests need Node 22+ and `npm ci` inside the extension directory.

## Gates

Run these after any change to `bin/`, `deployments.json`, or an always-loaded
instruction file, and before opening a pull request:

```bash
bin/check --lint
python3 tests/test_check.py
```

Component suites run in their own directories:

| component | command |
|---|---|
| `extensions/pi-interlock`, `extensions/sysprompt-editor` | `npm run test:unit` (`scripts/verify.sh` for the full interlock and sysprompt gates) |
| `extensions/agent-delegate`, `pageview`, `pi-scratchpad`, `pi-tui` | `npm test` |
| `extensions/prompt-picker`, `extensions/pi-config` | `node --test lib.test.ts` |
| `tools/sess`, `tools/prefixdiff` | `zig build test` |
| `tools/portaudit`, `tools/introspect-scan` | `tests/run.sh` |
| `skills/evoker-mode/tools/trail` | `test_trail.sh` |

## Conventions

`AGENTS.md` at the repository root is the change contract (path rules, line
budgets, where tests and design docs live). `skills/AUTHORING.md` governs new
skills. Prose follows `skills/slopfix/references/prose-standard.md`; run
`skills/slopfix/slopcheck.py <file>` on any document you touch.

Keep machine names, absolute home paths, and personal identifiers out of
tracked files; `bin/check --lint` is the gate. Pull requests that touch
`pi-interlock` follow the review rules in `extensions/AGENTS.md`.

## Releases

Versions follow semver in `package.json`, with a matching `CHANGELOG.md`
entry and an annotated `v<version>` tag. The npm package is
`@middlewatch/pi-agent-kit`, published from the tagged tree with
`npm publish --access public`.
