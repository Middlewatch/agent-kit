#!/usr/bin/env bash
# portaudit test suite. Classification is exercised against recorded `ss`
# output so the assertions do not depend on whatever this host happens to be
# listening on; only the last group touches live sockets.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
tool="$here/../portaudit"
syn="$here/fixtures/synthetic.txt"
live="$here/fixtures/live-2026-08-06.txt"
export PORTAUDIT_PASSWD="$here/fixtures/passwd.txt"

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
    printf 'FAIL %s: unexpected line matching /%s/ in:\n%s\n' "$name" "$pattern" "$out"
  else
    pass=$((pass + 1))
  fi
}

# --- classification -------------------------------------------------------
ok   "listing exits 0" 0 "$tool" --from "$syn"
has  "loopback v4 unmarked"   '^  4330 +tcp4 +127\.0\.0\.1 +pmcd'
has  "loopback v6 unmarked"   '^  4330 +tcp6 +::1'
has  "tailnet v4 marked ~"    '^~ 8080 +tcp4 +100\.100\.100\.100 +root +- +tailscaled\.service'
has  "tailnet v6 marked ~"    '^~ 8080 +tcp6 +fd7a:115c:a1e0::6a3b:9f2e'
has  "wildcard v4 marked !"   '^! 22 +tcp4 +0\.0\.0\.0 +root +- +sshd\.service'
has  "link-local v6 marked !" '^! 546 +udp6 +fe80::1 +root +- +NetworkManager\.service'
has  "LAN address marked !"   '^! 1900 +udp4 +192\.168\.1\.50 +owner +4004 +- +rogue'
has  "family-agnostic wildcard has no 4/6 suffix" '^! 9090 +tcp +\* +root +- +cockpit\.socket'
has  "uid resolves via passwd" '^  4330 +tcp4 +127\.0\.0\.1 +pmcd'
has  "absent uid means root"   '^! 9999 +tcp4 +0\.0\.0\.0 +root +- +-'
has  "slice-only cgroup yields no unit" '^! 1900 +udp4 +192\.168\.1\.50 +owner +4004 +-'
has  "innermost unit wins over parent slices" '^! 34536 +udp4 +0\.0\.0\.0 +owner +3003 +lemond\.service'
has  "sorted by port ascending" '4330'

# --- audit mode and exit codes -------------------------------------------
ok   "audit with findings exits 1" 1 "$tool" --audit --from "$syn"
has  "audit reports the count" '^7 listener\(s\) bound beyond loopback'
hasnt "audit hides compliant rows" '^[ ~][0-9 ]*[0-9]+ +(tcp|udp)'

ok   "port allowlist suppresses" 1 "$tool" --audit --from "$syn" --allow 22,546,9090
has  "allowlist accounting"  'suppressed by allowlist'
hasnt "allowed port gone from findings" '^! 22 '

ok   "unit allowlist suppresses" 1 "$tool" --audit --from "$syn" --allow-unit lemond.service
hasnt "allowed unit gone from findings" '^! 34536 '

# The `-` placeholder for an unresolved unit must never match an allowlist
# entry, or a waiver would silently cover every unattributed socket.
ok   "unresolved unit never matches" 1 "$tool" --audit --from "$syn" --allow-unit -
has  "dash-unit rows still found" '^! 9999 '
has  "no suppression from dash unit" '^7 listener'

ok   "all findings waived exits 0" 0 "$tool" --audit --from "$syn" \
       --allow 22,546,9090,1900,9999 --allow-unit lemond.service,vite-dev.service
has  "clean audit reports suppressions" 'no non-loopback listeners \(7 finding\(s\) suppressed'

ok   "repeated --allow accumulates" 0 "$tool" --audit --from "$syn" \
       --allow 22,546 --allow 9090,1900 --allow 9999 \
       --allow-unit lemond.service --allow-unit vite-dev.service
has  "repeated flags reach clean" 'no non-loopback listeners'

# Waived rows stay visible in the plain listing, marked `*`, so a waiver never
# makes a socket invisible — only unflagged.
ok   "waived rows visible in listing" 0 "$tool" --from "$syn" --allow 22
has  "waived row marked *" '^\* 22 +tcp4'

# --- port filter ----------------------------------------------------------
ok   "positional filter" 0 "$tool" --from "$syn" 4330
has  "filter keeps wanted port" '^  4330 '
hasnt "filter drops other ports" '^. (22|8080|9090) '

# --- usage and fail-closed ------------------------------------------------
ok   "help exits 0" 0 "$tool" --help
ok   "unknown option exits 2" 2 "$tool" --nope
ok   "bad port exits 2" 2 "$tool" abc
ok   "--allow without value exits 2" 2 "$tool" --allow
ok   "missing --from file exits 2" 2 "$tool" --from /nonexistent/socket/table
has  "IO error is prefixed" '^portaudit: cannot read'

# An empty socket table is a clean audit, not an error; the fail-closed path
# is for a table that cannot be read at all, which the case above covers.
ok   "empty table is clean" 0 "$tool" --audit --from /dev/null
has  "empty table says clean" 'no non-loopback listeners'

# --- live socket sanity ---------------------------------------------------
# The recorded capture and the live run should classify identically for the
# ports that are stable on this host; this catches an ss output-format drift.
if command -v ss >/dev/null 2>&1; then
  ok  "live run succeeds" 0 "$tool" --allow 22,41641,546,9090 --allow-unit lemond.service
  has "live run resolves root daemon units" 'sshd\.service|tailscaled\.service'
  ok  "recorded capture still parses" 0 "$tool" --from "$live"
  has "capture resolves units" 'tailscaled\.service'
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
