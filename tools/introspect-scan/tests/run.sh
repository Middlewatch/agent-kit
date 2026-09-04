#!/usr/bin/env bash
# introspect-scan test suite. Scanning runs against a fixture journal/skills/
# wiki tree so assertions do not depend on this machine's estate; --today pins
# the recency window.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
tool="$here/../introspect-scan"
fx="$here/fixtures"
base=(--journals "$fx/journals" --skills "$fx/skills" --wiki "$fx/wiki" --today 2026-09-01)

pass=0; fail=0

# ok <name> <expected-exit> <command...> — runs the command, compares exit
# status, and stashes stdout in $out for the caller to inspect further.
ok() {
  local name="$1" want="$2"; shift 2
  out="$("$@" 2>&1)"; local got=$?
  if [ "$got" = "$want" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL %s: exit %s, wanted %s\n%s\n' "$name" "$got" "$want" "$out"
  fi
}

has() {
  local name="$1" pattern="$2"
  if printf '%s\n' "$out" | grep -qE -- "$pattern"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL %s: no line matching /%s/ in:\n%s\n' "$name" "$pattern" "$out"
  fi
}

hasnt() {
  local name="$1" pattern="$2"
  if printf '%s\n' "$out" | grep -qE -- "$pattern"; then
    fail=$((fail + 1))
    printf 'FAIL %s: unwanted line matching /%s/ in:\n%s\n' "$name" "$pattern" "$out"
  else
    pass=$((pass + 1))
  fi
}

# --- snapshot ---------------------------------------------------------------
ok snapshot-runs 0 "$tool" "${base[@]}"
has header '^# introspect scan — 2026-09-01$'
has month-jul '^- 2026-07: 0/0/1$'
has month-aug '^- 2026-08: 3/3/6$'
# the golden autojournal episode (S1 fixture bytes, policy v3, dated after
# --today so outside the 30-day column): adr read,
# harvest LEDGER via bash, code-maps note read with a line range
has month-sep '^- 2026-09: 1/1/1$'
has skill-adr '^- +1 / 0  adr  mentions 0  bash-only 0$'
has note-range '^- +1  structural-code-maps-for-agents\.md$'
# ggg6 is policy v2 with a Files-shaped tail in prose: fallback, so its
# wizard path is a mention, not an invocation
has ggg6-fallback '^- +0 / 0  wizard  mentions 1  bash-only 0$'
# invocations are the harness markers (pi tag in ddd3, Claude Code line in
# eee4) or, when the episode carries a Files section (fff5), its successful
# reads; path-shaped references in aaa1/bbb2 and fff5's prose are mentions
has skill-diagnose '^- +2 / 2  diagnose  mentions 2  bash-only 0$'
has skill-slopfix '^- +1 / 1  slopfix  mentions 1  bash-only 0$'
# fff5's read! of harvest is a failed read, not consultation; its prose
# mention of skills/harvest/SKILL.md is a mention
has never-invoked '^- never invoked: wizard$'
# ...and the golden episode's harvest LEDGER via bash alone is counted as an
# invocation but flagged bash-only (a cat and a grep -l render identically)
has harvest-bash-read '^- +1 / 0  harvest  mentions 1  bash-only 1$'
# ddd3's injected slopfix body cites skills/harvest and zig-notes.md; neither
# counts as the session's own use
hasnt body-echo-skill 'harvest  mentions 2'
hasnt authoring-not-a-skill 'AUTHORING'
# fff5 touches zig-notes (bash, with a line range) and unused-note (child)
has note-hits '^- +3  zig-notes\.md$'
has note-child '^- +1  unused-note\.md$'
has distinct-notes '^- distinct notes touched ever: 3 of 3$'
hasnt index-excluded 'index\.md'
has friction-listed '^- friction-double-fire\.md$'
has friction-total '^- friction total: 1$'
has inbox-count '^## inbox: 1 untriaged \+ 1 friction$'

# prose mentions of a skill name are not invocations (ccc0 says "diagnose"
# in prose; only path-shaped references count)
ok july-not-diagnose 0 "$tool" "${base[@]}"
hasnt july-skill-touch '^- 2026-07: [12]/'

# --- --episodes -------------------------------------------------------------
ok episodes-skill 0 "$tool" "${base[@]}" --episodes diagnose
has ep-invoked '^invoked	.*aj1-eee4\.md'
has ep-invoked-files '^invoked	.*aj1-fff5\.md'
has ep-recent-mention '^mention	.*aj1-bbb2\.md'
has ep-older 'aj1-aaa1\.md'
hasnt ep-no-prose-hit 'aj1-ccc0\.md'
hasnt ep-under-cap 'showing'

ok episodes-bash-only 0 "$tool" "${base[@]}" --episodes harvest
has ep-invoked-bash '^invoked-bash	.*aj1-daff9910cf3e098a01e14e49e10812e9\.md'
has ep-failed-read-is-mention '^mention	.*aj1-fff5\.md'

ok episodes-note 0 "$tool" "${base[@]}" --episodes zig-notes.md
has ep-note-a 'aj1-aaa1\.md'
has ep-note-b 'aj1-bbb2\.md'

ok episodes-unknown 1 "$tool" "${base[@]}" --episodes no-such-artifact

# --- empty inventories are inert, not wildcards ------------------------------
tmp="$(mktemp -d)"
mkdir "$tmp/noskills"
ok empty-skills-runs 0 "$tool" --journals "$fx/journals" --skills "$tmp/noskills" \
  --wiki "$fx/wiki" --today 2026-09-01
has empty-skills-months '^- 2026-08: 0/3/6$'
has empty-skills-never '^- never invoked: none$'
rm -rf "$tmp"

# --- --write ----------------------------------------------------------------
tmp="$(mktemp -d)"
cp -r "$fx/wiki" "$tmp/wiki"
ok write-runs 0 "$tool" --journals "$fx/journals" --skills "$fx/skills" \
  --wiki "$tmp/wiki" --today 2026-09-01 --write
if [ -f "$tmp/wiki/metrics/introspect/2026-09-01.txt" ]; then
  pass=$((pass + 1))
else
  fail=$((fail + 1))
  printf 'FAIL write-dest: no snapshot at metrics/introspect/2026-09-01.txt\n'
fi
# a same-day rerun must not clobber the snapshot (it may hold sweep rulings)
ok write-refuses-overwrite 1 "$tool" --journals "$fx/journals" --skills "$fx/skills" \
  --wiki "$tmp/wiki" --today 2026-09-01 --write
has refuse-message 'refusing to overwrite'
rm -rf "$tmp"

ok episodes-write-exclusive 1 "$tool" "${base[@]}" --episodes diagnose --write

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" = 0 ]
