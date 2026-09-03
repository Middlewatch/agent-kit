#!/usr/bin/env bash
# Snapshot-series recorder for a herdr pane. Polls the rendered screen
# and saves a new snapshot whenever its content changes (sha256 dedupe —
# the API's pane revision counter does NOT track output, verified 0.7.5).
# Runs until the pane disappears or the script is killed.
#
# Usage: record.sh PANE_ID EVIDENCE_DIR [INTERVAL_SECONDS]
#
# Output layout (one run-stamped directory per invocation, so reruns
# into the same evidence dir never clobber earlier frames):
#   EVIDENCE_DIR/rec/<run-stamp>/NNNN.visible.ansi   rendered screen, ANSI kept
#   EVIDENCE_DIR/rec/<run-stamp>/NNNN.recent.txt     recent output, --lines bound
#   EVIDENCE_DIR/rec/<run-stamp>/index.tsv           seq  epoch_ms  recent_lines  sha
#
# The recent_lines column is the history-pollution metric, read with an
# explicit --lines bound: bare `--source recent` returns only a short
# window (~80 lines), which saturates and would make every busy pane
# look clean. A value of -1 means the read failed.
#
# This is a snapshot series, not a byte stream — escape-sequence traffic
# between polls is not captured, and screen states shorter than the poll
# interval can be missed. Use the app's own --record flag for byte-level
# analysis.
set -euo pipefail

[[ $# -ge 2 ]] || { echo "usage: record.sh PANE_ID EVIDENCE_DIR [INTERVAL_SECONDS]" >&2; exit 2; }
pane=$1 evidence=$2
interval=${3:-0.25}
rec=$evidence/rec/$(date +%Y%m%d-%H%M%S)
mkdir -p "$rec"
index=$rec/index.tsv
printf 'seq\tepoch_ms\trecent_lines\tsha\n' > "$index"

last_sha=''
seq=0
fails=0
while :; do
  if ! frame=$(herdr pane read "$pane" --source visible --raw 2>"$rec/.stderr"); then
    # The CLI reports errors as JSON on stderr (verified 0.7.5).
    if grep -q pane_not_found "$rec/.stderr"; then
      echo "record.sh: pane $pane gone, stopping after $seq snapshots" >&2
      exit 0
    fi
    fails=$((fails + 1))
    if (( fails >= 5 )); then
      echo "record.sh: pane read failing repeatedly (last: $(cat "$rec/.stderr")), stopping after $seq snapshots" >&2
      exit 1
    fi
    sleep "$interval"
    continue
  fi
  fails=0
  sha=$(sha256sum <<<"$frame" | cut -d' ' -f1)
  if [[ $sha != "$last_sha" ]]; then
    seq=$((seq + 1))
    stem=$(printf '%s/%04d' "$rec" "$seq")
    printf '%s\n' "$frame" > "$stem.visible.ansi"
    if herdr pane read "$pane" --source recent --lines 2000 > "$stem.recent.txt" 2>/dev/null; then
      lines=$(wc -l < "$stem.recent.txt")
    else
      : > "$stem.recent.txt"
      lines=-1
    fi
    printf '%d\t%d\t%d\t%s\n' "$seq" "$(date +%s%3N)" "$lines" "$sha" >> "$index"
    last_sha=$sha
  fi
  sleep "$interval"
done
