#!/usr/bin/env bash
# Tests for the trail script. Run from anywhere: ./test_trail.sh
# SC2319: every `check "..." $?` deliberately reads the status of the
# condition on the line directly above it.
# shellcheck disable=SC2319
set -u

here="$(cd "$(dirname "$0")" && pwd)"
trail="$here/trail"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pass=0
fail=0

check() {
	local desc="$1" ok="$2"
	if [ "$ok" = "0" ]; then
		pass=$((pass + 1))
	else
		fail=$((fail + 1))
		printf 'FAIL: %s\n' "$desc" >&2
	fi
}

# 1. First write creates the file with a header and one row.
log="$tmp/a.tsv"
"$trail" "$log" build "chose sqlite" "single file, no daemon" "bench.md" kept
[ "$(head -1 "$log")" = "$(printf 'ts\tstep\tdecision\twhy\tevidence\tresult')" ]
check "header created on first write" $?
[ "$(wc -l < "$log")" -eq 2 ]
check "one data row after first write" $?

# 2. Second write appends without a second header.
"$trail" "$log" build "second row" why evidence result
[ "$(wc -l < "$log")" -eq 3 ] && [ "$(grep -c '^ts' "$log")" -eq 1 ]
check "append keeps a single header" $?

# 3. Row has exactly six tab-separated cells and an ISO-8601 UTC timestamp.
row="$(sed -n '2p' "$log")"
[ "$(printf '%s' "$row" | awk -F'\t' '{print NF}')" -eq 6 ]
check "row has six cells" $?
printf '%s' "$row" | cut -f1 | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
check "timestamp is ISO-8601 UTC" $?

# 4. Tabs and newlines inside a cell become spaces.
log2="$tmp/b.tsv"
"$trail" "$log2" s "$(printf 'has\ttab')" "$(printf 'has\nnewline')" e r
row="$(sed -n '2p' "$log2")"
[ "$(printf '%s' "$row" | awk -F'\t' '{print NF}')" -eq 6 ]
check "embedded tab/newline does not add cells" $?
printf '%s' "$row" | cut -f3 | grep -q 'has tab'
check "tab replaced with space" $?

# 5. Formula-leading cells get a quote prefix.
log3="$tmp/c.tsv"
"$trail" "$log3" "=SUM(A1)" "+x" "@cmd" "-flag" ok
row="$(sed -n '2p' "$log3")"
[ "$(printf '%s' "$row" | cut -f2)" = "'=SUM(A1)" ]
check "= prefixed" $?
[ "$(printf '%s' "$row" | cut -f3)" = "'+x" ]
check "+ prefixed" $?
[ "$(printf '%s' "$row" | cut -f4)" = "'@cmd" ]
check "@ prefixed" $?
[ "$(printf '%s' "$row" | cut -f5)" = "'-flag" ]
check "- prefixed" $?
# 6. Control characters (ANSI ESC, BEL, DEL) are stripped from cells.
log5="$tmp/f.tsv"
"$trail" "$log5" s "$(printf 'red\033[31mtext\007\177end')" w e r
row="$(sed -n '2p' "$log5")"
[ "$(printf '%s' "$row" | cut -f3)" = "red[31mtextend" ]
check "control characters stripped" $?

# 7. An existing file is never truncated by the header path.
log6="$tmp/g.tsv"
"$trail" "$log6" s first w e r
"$trail" "$log6" s second w e r
[ "$(wc -l < "$log6")" -eq 3 ] && [ "$(grep -c '^ts' "$log6")" -eq 1 ]
check "existing file preserved, single header" $?

# 8. Missing parent directory is created.
log4="$tmp/deep/nested/d.tsv"
"$trail" "$log4" s d w e r
[ -f "$log4" ]
check "parent directories created" $?

# 9. Wrong arity exits nonzero with usage and writes nothing.
out="$("$trail" "$tmp/e.tsv" one two 2>&1)"
rc=$?
[ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q '^usage:' && [ ! -f "$tmp/e.tsv" ]
check "wrong arity fails without writing" $?

printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
