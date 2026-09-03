#!/usr/bin/env bash
# External conformance harness. Drives the real binary through its real
# command line; reads nothing from src/.
#
#   ./harness/run.sh                 check everything
#   ./harness/run.sh --record        rewrite the rendering goldens
#   PREFIXDIFF=/path/to/other ./harness/run.sh
#
# The point of this directory is freezability: this harness plus DESIGN.md
# should be enough to check a rewrite in another language without reading the
# original, so nothing here may import from src/ or assume Zig.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
binary="${PREFIXDIFF:-$here/../zig-out/bin/prefixdiff}"

if [ ! -x "$binary" ]; then
    echo "harness: no binary at $binary (run 'zig build' or set PREFIXDIFF)" >&2
    exit 2
fi
command -v cmp >/dev/null || { echo "harness: cmp(1) not found; it is the oracle" >&2; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "harness: driving $binary"
status=0

run_stage() {
    local name="$1"; shift
    echo
    echo "== $name =="
    if ! "$@"; then status=1; fi
}

if [ "${1:-}" = "--record" ]; then
    run_stage "goldens (recording)" python3 "$here/goldens.py" "$binary" "$work" --record
    echo
    echo "goldens rewritten; review the diff before committing."
    exit $status
fi

run_stage "differential vs cmp(1)" python3 "$here/differential.py" "$binary" "$work"
run_stage "boundedness" python3 "$here/boundedness.py" "$binary" "$work"
run_stage "rendering goldens" python3 "$here/goldens.py" "$binary" "$work"

echo
if [ $status -eq 0 ]; then echo "harness: PASS"; else echo "harness: FAIL"; fi
exit $status
