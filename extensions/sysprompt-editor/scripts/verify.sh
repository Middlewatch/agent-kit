#!/usr/bin/env bash
# pi-sysprompt-editor gate: reproducible install, static checks, and unit
# tests of the template splice. Tests make no provider request; the
# dependency install may access the npm registry.
set -euo pipefail
cd "$(dirname "$0")/.."

# Toolchain floor: the unit tests run TypeScript directly through node's
# --experimental-strip-types (node 22.6+; on by default from node 23).
node_major="$(node --version | sed 's/^v\([0-9]*\).*/\1/')"
if [ "$node_major" -lt 22 ]; then
  echo "verify: node 22 or newer required, found $(node --version)" >&2
  exit 1
fi

npm ci --ignore-scripts --no-audit --no-fund
npm run format:check
npm run typecheck
npm run test:unit
