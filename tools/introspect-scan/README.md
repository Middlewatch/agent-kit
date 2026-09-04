# introspect-scan

The read side of the introspect sweep (spec: `../../docs/specs/2026-09-01-introspect.md`):
scans journal episodes for steering-artifact usage and inventories
`friction-` notes in the inbox. Plain runs print a dated snapshot; the sweep
uses `--episodes` to pull the evidence behind any count.

Three signals per episode:

- **Invocation**: when the episode carries autojournal's `## Files` section
  (policy `pi-visible-v3`, live or backfilled), a successful `read`, `bash`,
  or `child:read` of any file under `skills/<name>/`. Otherwise the
  harness's skill-injection marker: pi wraps the body in
  `<skill name="x" ...>...</skill>`; Claude Code prefixes it with
  `Base directory for this skill: .../skills/x`.
- **Mention**: a path-shaped reference (`skills/<name>`, `<name>/SKILL.md`)
  in prose outside any injected skill body and the Files section. Mostly
  sessions editing the skill.
- **Note touch**: with a Files section, a consulted target whose filename is
  a wiki note; otherwise a wiki note slug or `wiki/...` path outside any
  injected skill body.

## Usage

```
introspect-scan [options]

  --episodes <artifact>  list episodes (newest first, max 20) referencing this
                         skill name or wiki note filename, one per line as
                         `invoked<TAB>path` or `mention<TAB>path`; reports
                         the cap on stderr when it truncates; exit 1 if unknown
  --write                also write the snapshot to
                         <wiki>/metrics/introspect/<date>.txt; refuses to
                         overwrite an existing snapshot (it may hold sweep
                         rulings) and is mutually exclusive with --episodes
  --journals <dir>       journal root      (default ~/.agents/journals)
  --skills <dir>         skills root       (default ~/.agents/skills)
  --wiki <dir>           wiki root         (default ~/.agents/wiki)
  --today <YYYY-MM-DD>   pin the date and the recency window (for tests
                         and reproducing snapshots)
```

Snapshot sections: episodes by month (skill-invoking/wiki-touching/total),
per-skill invocations with a 30-day column and a mentions count plus the
never-invoked list, most-touched wiki notes, friction notes, and the
untriaged inbox depth.

## Measurement bias

Episodes with a Files section count consultation exactly for the `read`
tool, `.md` path tokens in bash commands, and delegated children's
`inspect_read`; they still miss a skill absorbed into habit (no read at
all) and paths read by other means. Episodes without one (before the
2026-09 backfill, and every Claude Code episode) fall back to the injection
marker, which undercounts: a model-invoked skill in pi is a `read` of
`SKILL.md` that the marker never sees, so the adr skill read as never
invoked while 33 episodes wrote ADRs in its exact template (2026-09-03
sweep). Prose mentions deliberately do not count as invocations. A
path mention mostly measures curation (sessions that edit a skill name its
path without following it). Injected skill bodies are stripped before
matching mentions and note touches, because a skill that cites another
skill's files otherwise inflates that skill on every run: before the strip,
evoker-mode's citation of slopfix's prose standard made slopfix read 56
episodes against 4 real invocations (2026-09-03 sweep). Claude Code's
injected body has no closing delimiter, so only its marker line is stripped
and the body's citations still count as mentions. Read the numbers as trend signal
for the periodic introspect sweep, never as a per-artifact verdict. The
wiki's own `bin/usage-report` keeps the write-side stats (commit cadence,
substantive edits, cold notes).

## Tests

`tests/run.sh` runs the scanner against the fixture journal/skills/wiki tree
in `tests/fixtures/` with `--today` pinned, asserting snapshot lines,
`--episodes` output, and the `--write` destination.
