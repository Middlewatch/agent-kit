# pi-sysprompt-editor design basis

**Status:** as built 2026-08-17.

Reading list: `README.md` for the short product description.

## Thesis

The owner manages Pi's core system prompt as plain markdown templates.
Selecting a template changes the next turn's prompt without any restart, an
inspect command produces the exact system prompt sent to the provider
including every extension's injections, and every unrecognized condition
leaves the prompt exactly as the harness built it.

The acceptance test has three parts, and a build passes or fails on all of
them:

- After a template switch, the next turn's prompt core matches the new
  template's render exactly.
- An armed inspect dump is byte-identical to the system prompt in that
  turn's provider request payload.
- Each fail-open branch has a unit test that feeds the unrecognized
  condition and asserts the stock prompt survives unmodified.

## Model and primitives

- **Stock core**: the harness-assembled prompt from the identity line
  through the documentation section, before appended layers.
- **Template**: a markdown file in the kit's `guidance/sysprompt/`, owner
  prose with five placeholders: `{{AVAILABLE_TOOLS}}`, `{{GUIDELINES}}`,
  `{{PI_DOCS}}`, `{{PI_SCRATCHPAD}}` (the session scratch path from
  `$PI_SCRATCHPAD`, empty when unset), and `{{SKILLS}}` (Pi's skills block
  lifted out of the tail). Adding a placeholder touches `renderTemplate` in
  `lib/splice.ts`, every shipped template, the placeholder unit test, and
  this list.
- **Active pointer**: a small state file naming which template the splice
  reads. Switching templates writes the pointer, and the next turn renders
  it.
- **Tail**: everything the harness appends after the core (project context,
  skills, working directory, scratchpad), passed through untouched.
- **Splice**: anchor-based extraction of live data from the stock core,
  rendered into the active template at each turn start.
- **Inspection capture**: two artifacts. The immediate dump renders the base
  prompt layers from the harness's structured prompt inputs at command
  time. The armed capture records the final system prompt from the next
  provider request, after every extension has chained its changes, and is
  the authoritative one.
- **Output test**: a prebuilt analysis prompt plus a fixture document sent
  through the normal session pipeline, with the response saved to a dated
  results file for cross-model comparison.

## Doctrine

- Fail open (2026-08-17): every unrecognized condition leaves the prompt
  exactly as the harness built it. A prompt rewrite that guesses is worse
  than no rewrite.
- The template owns the prose; the harness owns the live data
  (2026-08-17). The extension never hardcodes tool names or guideline
  text.
- A custom `SYSTEM.md` prompt outranks the template (2026-08-17): explicit
  per-project owner intent wins over the global template.
- Switching is data rather than machinery (2026-08-17): template selection
  changes which file the per-turn splice reads. No reload or restart path exists.
- Ground truth over reconstruction (2026-08-17): the authoritative
  inspection artifact comes from the actual provider request. The immediate
  dump is labeled best-effort because it cannot see other extensions'
  per-turn changes.
- The output test rides the real pipeline (2026-08-17): the standardized
  test goes through a normal session turn so results reflect the prompt
  assembly real usage sees.

## Expected behaviors

The extension rewrites the stock core from the active template on each turn
start, preserves the tail byte-for-byte, and stands down for custom
prompts, drifted shapes, and a missing template. Placeholders are optional:
an absent placeholder means the template omits that section. Unit tests
cover the rewrite and each fail-open branch.

A single command, `/sysprompt`, opens an action menu with four actions:

- switch: pick the active template from `guidance/sysprompt/`
- new: seed a fresh template as a copy of the active one
- inspect: immediate dump plus armed ground-truth capture, both written as
  markdown files, with a raw text twin of the captured prompt for byte
  comparison
- test: send the standardized analysis prompt with the fixture document and
  save the response to a dated results file whose header names the template
  that rendered and its content sha256

Template authoring itself stays in ordinary file edits.

Two behaviors follow from the harness's event semantics. The armed capture
rides `before_provider_request`, which fires only when the provider calls
Pi's `onPayload` seam. A turn that ends with the capture still armed
cancels it with a warning rather than letting it attach to a later turn.
The output test attributes its result to the loop's final reply. A
tool-calling assistant message ends its own turn but not the loop, so the
pending capture holds until a message that stops for another reason, and
the action refuses to start while the agent is busy or a test is pending.

## Deliberately not in scope

- **Editing the appended layers** (project context, skills): the harness
  owns them, and rewriting them would break the layering contract other
  tools rely on.
- **An in-TUI prose editor**: authoring is file editing, which every agent
  and editor already does better than a widget.
- **Hot-reload or restart machinery**: unnecessary, because the splice runs
  per turn and a pointer change takes effect on the next message.
- **An automated multi-model test matrix**: deferred. The in-session
  single-model test ships first, and the matrix adds direct API calls that
  bypass the real prompt assembly and costs per run.
- **Per-project template selection**: `SYSTEM.md` already provides a
  per-project override and outranks the template by doctrine.

## Verification spine

`scripts/verify.sh` is the gate: reproducible install, format check,
typecheck, and unit tests. The unit suite runs against a synthetic stock
prompt and covers the splice, every fail-open branch, pointer resolution
(missing pointer, invalid pointer, pointer naming a missing template,
missing default), template scaffolding, the command and hook wiring
through a stub extension API, and byte-compares of the artifact formats
against the golden pairs in `fixtures/golden/`. The armed inspection
capture doubles as the field oracle. Its dump against the provider payload
is the acceptance check for splice correctness in a live session.

Open question carried forward: a model-free conformance harness that drives
the real Pi prompt loader, so shape drift in a harness update is caught by
the gate rather than discovered in session.

Freezability: the template set, the output-test fixture, the golden
input/expected pairs, the unit suites' synthetic stock prompt, and this
document would rebuild the behavior if the tree vanished.

## Structure

- `index.ts`: event and command registration, kept thin.
- `lib/splice.ts`: core rewrite and fail-open checks.
- `lib/templates.ts`: template store (list, resolve active pointer,
  scaffold new).
- `lib/inspect.ts`: immediate dump, payload extraction, armed capture,
  artifact naming.
- `lib/output-test.ts`: standardized test send and results file.
- `guidance/sysprompt/` in the kit (resolved relative to the extension):
  owner-authored template set with the gitignored `.active` pointer, kept
  with the rest of the guidance prose rather than with the code.
- `fixtures/`: the output-test document and the golden pairs.
- `tests/`: unit suites.
- `artifacts/`: generated inspect and output-test files, gitignored.

## Provenance

- Seeded from the working single-template extension built 2026-08-17 and
  moved here for standalone development.
- Folded into agent-kit on 2026-09-02 (kit ADR 0002): the extension tracks
  the kit's cadence and the templates are guidance.
- Revised 2026-08-17 to expand scope to the template manager. Feasibility
  was checked against the Pi extension documentation shipped with the
  harness.
- Built 2026-08-17; the two harness-semantics behaviors in Expected
  behaviors were review findings ratified as amendments during that build.
