# introspect-scan

The read side of the introspect sweep (spec: `../../docs/specs/2026-09-01-introspect.md`):
scans journal episodes for steering-artifact usage — path-shaped skill
references (`skills/<name>`, `<name>/SKILL.md`) and wiki note slugs — and
inventories `friction-` notes in the inbox. Plain runs print a dated snapshot;
the sweep uses `--episodes` to pull the evidence behind any count.

## Usage

```
introspect-scan [options]

  --episodes <artifact>  list episodes (newest first, max 20) referencing this
                         skill name or wiki note filename; exit 1 if unknown
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
per-skill episode counts with a 30-day column plus the never-invoked list,
most-touched wiki notes, friction notes, and the untriaged inbox depth.

## Measurement bias

By construction, a journal path-mention undercounts influence (a skill
absorbed into habit leaves no path reference; prose mentions deliberately do
not count) and overcounts curation (sessions that edit a skill mention its
path without following it). Read the numbers as trend signal for the periodic
introspect sweep, never as a per-artifact verdict. The wiki's own
`bin/usage-report` keeps the write-side stats (commit cadence, substantive
edits, cold notes).

## Tests

`tests/run.sh` runs the scanner against the fixture journal/skills/wiki tree
in `tests/fixtures/` with `--today` pinned, asserting snapshot lines,
`--episodes` output, and the `--write` destination.
