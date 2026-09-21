# Change-review criteria

Five rules earned from incidents in this estate. `SKILL.md` step 3 applies them
when the region under review is a recent change (a diff, a port, a new
package); on settled code the last three still apply and the first two are
NOTEs at most. Each is a finding
when it fails. Append new rules only from a real incident, amending an existing
entry when it is the same failure class.

## Every new file lands with direct tests on its own layer

- **Status:** verified
- **Evidence:** a 1,400-line row-assembly file with zero direct tests hid
  behind green integration gates.
- **Consequence:** a new file whose only coverage is an integration gate is a
  finding (NOTE on settled code).

## Dropped or ported-away tests get written deferral notes

- **Status:** verified
- **Evidence:** thirty-eight test blocks vanished silently in a port, and the
  review had to reconstruct what coverage was lost.
- **Consequence:** compare the test inventory before and after the change; a
  silent drop is a finding (NOTE on settled code).

## Gate the real path, not a miniature

- **Status:** verified
- **Evidence:** a latency gate measured a toy reimplementation while the app
  path went unmeasured.
- **Consequence:** open the gate and confirm it exercises the production code
  path it claims to cover; a gate over a stand-in is CRITICAL when it claims
  coverage of a defect.

## Test through the construction path, not just the leaf type

- **Status:** verified
- **Evidence:** a by-field struct clone on an enforcement path dropped three
  security fields; unit tests built the struct directly and stayed green over
  the hole.
- **Consequence:** for any enforcement or security type, trace how production
  constructs it and check that a test goes through that constructor.

## Notice other writers

- **Status:** verified
- **Evidence:** a second session widened a shared type, updated one of three
  call sites, and broke a sibling package invisibly to its own gate.
- **Consequence:** when another session or branch is active on the same tree,
  check every call site of a widened type and rerun the affected gates before
  trusting green.
