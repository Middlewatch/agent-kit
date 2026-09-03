#!/usr/bin/env bash
# Spawn a TUI under review in a sibling herdr pane and print the pane id.
#
# Usage: spawn.sh [-d right|down] [-r RATIO] [-c CWD] [-s] -e EVIDENCE_DIR -- COMMAND [ARG...]
#
#   -d  split direction (default: down)
#   -r  split ratio (default: 0.5)
#   -c  working directory for the pane (default: caller's cwd)
#   -e  evidence directory; the launch wrapper is written here (required)
#   -s  stage only: write and announce the wrapper but let the owner run it
#
# The command is written to EVIDENCE_DIR/launch.sh with exact quoting and
# run by path, because `herdr pane run` types its arguments into the
# pane's shell and drops quoting on compound commands.
set -euo pipefail

dir=down ratio=0.5 cwd=$PWD evidence="" stage=0
while getopts "d:r:c:e:s" opt; do
  case $opt in
    d) dir=$OPTARG ;;
    r) ratio=$OPTARG ;;
    c) cwd=$OPTARG ;;
    e) evidence=$OPTARG ;;
    s) stage=1 ;;
    *) exit 2 ;;
  esac
done
shift $((OPTIND - 1))

command -v jq >/dev/null || { echo "spawn.sh: jq is required" >&2; exit 1; }
[[ -n ${HERDR_PANE_ID:-} ]] || { echo "spawn.sh: not inside a herdr session" >&2; exit 1; }
[[ -n $evidence ]] || { echo "spawn.sh: -e EVIDENCE_DIR is required" >&2; exit 2; }
[[ $# -ge 1 ]] || { echo "spawn.sh: no command given after --" >&2; exit 2; }
mkdir -p "$evidence"

wrapper=$evidence/launch.sh
{
  printf '#!/usr/bin/env bash\n'
  printf '# Launch wrapper written by spawn.sh; markers here never appear in the typed command line.\n'
  printf 'printf "__TUI_LAUNCH_%%s__\\n" "$(date +%%s)"\n'
  printf '%q ' "$@"
  printf '\nprintf "__TUI_EXIT_%%s__\\n" "$?"\n'
} > "$wrapper"
chmod +x "$wrapper"

pane_json=$(herdr pane split "$HERDR_PANE_ID" --direction "$dir" --ratio "$ratio" --cwd "$cwd" --no-focus)
pane_id=$(jq -re '.result.pane.pane_id' <<<"$pane_json")

if [[ $stage -eq 1 ]]; then
  herdr pane send-text "$pane_id" "bash $wrapper"
  echo "staged in $pane_id — owner presses Enter to launch: bash $wrapper" >&2
else
  herdr pane run "$pane_id" bash "$wrapper"
  if ! herdr pane wait-output "$pane_id" --regex '__TUI_LAUNCH_[0-9]+__' --timeout 5000 >/dev/null; then
    echo "spawn.sh: launch marker not seen within 5s in $pane_id; pane left open for inspection (close with: herdr pane close $pane_id)" >&2
    echo "$pane_id"
    exit 3
  fi
fi
echo "$pane_id"
