#!/usr/bin/env bash
# Complete pi-interlock gate: reproducible install, static checks, frozen
# fixture and fuzz contracts, model-free real-Pi conformance, ownership proof,
# and informational cost measurement. Tests make no provider request; the
# dependency install may access the npm registry.
set -euo pipefail
cd "$(dirname "$0")/.."

# Reproducible dev install, static gates, fast tests, and model-free
# conformance through Pi's public loader and pre-execution runner.
npm ci --ignore-scripts --no-audit --no-fund
npm run format:check
npm run typecheck
npm run test:unit
python3 -m unittest discover -s tests -t . -v
node --experimental-strip-types tests/measure-costs.ts
