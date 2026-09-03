# pi-interlock

A high-precision accident-prevention extension for the Pi coding agent.

Interlock is a seatbelt rather than a sandbox. In shield mode it blocks direct access
to named credential stores and direct machine-level catastrophes, then asks
before boundary-crossing recursive deletion and consequential Git pushes.
Unknown and recoverable operations default to allow.

The footer shows the active mode. Use `/interlock` to report it or
`/interlock off|audit|shield` to atomically save and activate a different mode.
The extension loads through the kit's pi package (the kit's `package.json`
lists `./extensions/pi-interlock/index.ts`), which the kit's `bin/install`
registers.

- [`DESIGN.md`](DESIGN.md): current behavior, limits, ownership, and
  verification contract
- [`contracts/seatbelt-v2/`](contracts/seatbelt-v2/): language-neutral
  operation, policy, configuration, audit, and fixture contracts
- `tests/` and `fixtures/`: contract, fuzz, and real-Pi conformance assets
- `scripts/verify.sh`: the single definition of green

Repository review rules for security-sensitive changes live in
[`../AGENTS.md`](../AGENTS.md).
