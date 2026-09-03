#!/usr/bin/env bash
# One-shot evidence capture for a herdr pane: rendered screen (text and
# ANSI), recent history, process info, and pane geometry, in a single
# timestamped directory. Prints the directory path.
#
# If any capture fails (e.g. the pane died mid-snapshot), the directory
# is renamed to *.partial so a half-populated snapshot can't be mistaken
# for a complete one. The CLI reports errors on stderr, so a failed
# read leaves its file empty.
#
# Usage: snapshot.sh PANE_ID EVIDENCE_DIR [LABEL]
set -euo pipefail

command -v jq >/dev/null || { echo "snapshot.sh: jq is required" >&2; exit 1; }
[[ $# -ge 2 ]] || { echo "usage: snapshot.sh PANE_ID EVIDENCE_DIR [LABEL]" >&2; exit 2; }
pane=$1 evidence=$2 label=${3:-snap}

dir=$evidence/snap-$(date +%Y%m%d-%H%M%S)-$label
mkdir -p "$dir"
trap 'mv "$dir" "$dir.partial" 2>/dev/null; echo "snapshot.sh: capture failed, kept $dir.partial" >&2' ERR

herdr pane read "$pane" --source visible            > "$dir/visible.txt"
herdr pane read "$pane" --source visible --raw      > "$dir/visible.ansi"
herdr pane read "$pane" --source recent --lines 2000 > "$dir/recent.txt"
herdr pane read "$pane" --source recent-unwrapped --lines 2000 > "$dir/recent-unwrapped.txt"
herdr pane process-info --pane "$pane" | jq '.result.process_info' > "$dir/process-info.json"
herdr pane get "$pane" | jq '.result.pane' > "$dir/pane.json"

echo "$dir"
