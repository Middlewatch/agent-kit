#!/usr/bin/env bash
# Guarded input to a herdr pane: refuses to send unless the expected
# binary is the pane's foreground process.
#
# Usage: drive.sh PANE_ID EXPECTED_PROCESS keys KEY [KEY...]
#        drive.sh PANE_ID EXPECTED_PROCESS text TEXT
#
# EXPECTED_PROCESS is compared against the foreground process `name`
# reported by `herdr pane process-info`. On mismatch the pane's actual
# process list is printed and nothing is sent (exit 2). Keystrokes into
# the wrong program are unrecoverable, so verify the target before
# every send.
set -euo pipefail

command -v jq >/dev/null || { echo "drive.sh: jq is required" >&2; exit 1; }
[[ $# -ge 4 ]] || { echo "usage: drive.sh PANE_ID EXPECTED_PROCESS keys|text ..." >&2; exit 2; }
pane=$1 expected=$2 mode=$3
shift 3

info=$(herdr pane process-info --pane "$pane")
fg=$(jq -r '.result.process_info.foreground_processes[].name' <<<"$info")
if ! grep -qxF "$expected" <<<"$fg"; then
  echo "drive.sh: REFUSED — foreground of $pane is [$(tr '\n' ' ' <<<"$fg")], expected '$expected'" >&2
  jq '.result.process_info' <<<"$info" >&2
  exit 2
fi

case $mode in
  keys) herdr pane send-keys "$pane" "$@" ;;
  text)
    [[ $# -eq 1 ]] || { echo "drive.sh: text mode takes exactly one argument (quote it)" >&2; exit 2; }
    herdr pane send-text "$pane" "$1"
    ;;
  *) echo "drive.sh: mode must be 'keys' or 'text'" >&2; exit 2 ;;
esac
