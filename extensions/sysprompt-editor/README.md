# sysprompt-editor

A Pi extension for editable system-prompt cores and scoped instruction placement.
The harness supplies live data; templates supply prose and layout. See the scoped
slot contract below. The authoring guide and model-family examples are at
`~/.agents/kit/guidance/sysprompt/AUTHORING.md`.

## Templates and session selection

Templates live at `~/.agents/kit/guidance/sysprompt/*.md`. Each session saves a
filename in a `sysprompt-editor:selection` custom entry, separate from model-facing
messages. Restoration follows the active branch. Resume keeps that selection;
fork inherits the selection at its branch point. Model changes leave it alone.
Each turn rereads the file, so edits affect all sessions pinned to that name.

For a branch without a saved selection, the gitignored `.active` pointer supplies
the initial default, falling back to `default.md`. The extension saves the resolved
name before rendering. Switching writes only session state. A missing pinned file
preserves Pi's incoming prompt and keeps the name; restoring the file recovers on
the next turn. Malformed state and failed writes also fail open. Normal turns
report fallback when it first occurs or its reason changes, through UI notification
or stderr in headless mode. A custom `SYSTEM.md` or programmatic core bypasses the
template without an error.

## The `/sysprompt` command

`/sysprompt` opens a menu of four actions; `/sysprompt <action>` jumps
straight to one. Cancelling any picker ends the command with no write.

- `switch`: pick the session template, or use `/sysprompt switch name.md` headlessly.
- `new`: name a template (`[a-z0-9-]+`) and create it as a byte copy of the
  currently active one; existing files are never overwritten.
- `inspect`: writes a command-time inventory, then captures the next provider
  system text as readable `.md` and extracted `.txt` in `artifacts/inspect/`.
  Multiple provider text blocks are joined with blank lines. The metadata records
  selected and rendered names, template and provider-text hashes, fallback/bypass
  reason, core source, and each loaded instruction file's scope and content hash. On `claude-go`
  with `CLAUDE_GO_CAPTURE_DIR` set, a separate wire capture can reveal downstream
  system-text changes.
- `test`: sends "Summarize this article for me." with
  `fixtures/output-test-document.md` through the normal pipeline, captures its
  provider prompt, and writes the reply to
  `artifacts/output-tests/<stamp>-<provider>-<model>.md` with render provenance.
  Refused while the agent is busy or another output test is pending.

Provider capture rides Pi's `before_provider_request` event, which a custom
provider only emits if its `streamSimple` calls `options.onPayload`. If a
turn ends without the event, the capture is cancelled with a warning.

## Layout

- `index.ts`: hook and command registration; logic lives in `lib/`.
- `lib/splice.ts`: tail split, anchor extraction, template render.
- `lib/templates.ts`: template files, initial-default pointer, and scaffold.
- `lib/selection.ts`: versioned selection parsing and branch restoration.
- `lib/inspect.ts`: immediate dump, payload extraction, armed capture,
  artifact naming. Capture arms belong to one extension instance.
- `lib/evidence.ts`: scoped input inventories and content hashes.
- `lib/output-test.ts`: output-test prompt, result naming and format.
- `fixtures/golden/`: input/expected pairs that pin the artifact formats
  byte for byte.

`DESIGN.md` is the design basis. `scripts/verify.sh` is the definition of
green (Node 22.6+, `npm ci`, prettier, tsc, unit tests, source conformance).
It requires `PI_SOURCE_DIR` below. Captures remain local; no per-turn archive or
model-compliance score is produced.

## Source conformance

Scoped instruction placement targets Pi v0.85.0 with the companion source
patch in `patches/pi-0.85.0.patch`, based on upstream `107d79f11072bbc8a3a757ed7fd69596bee7d68c`.
The loader records global or workspace scope, including the workspace directory,
in `contextFiles[].scope`. Pi renders a neutral `instruction_context` container
with `global_instructions` and `workspace_instructions` blocks for both stock
and custom cores. Legacy SDK context without scope uses an `instructions` block.

Apply the patch to a clean checkout of that revision with `git apply <patch-path>`.
It includes both loader provenance and immediate, transactional custom-entry
persistence, original-prompt provenance, and isolated final-payload observation.

Run `PI_SOURCE_DIR=<patched-checkout> node scripts/conformance.mjs` from this
extension directory. The fixture uses the real loader and AgentSession, then
records a provider payload without network access. The command also typechecks
the extension and conformance tests against the patched source. Install the source checkout's
locked dependencies and build its chord, telemetry, and ai packages first;
Pi's development guide covers generated model data. This command does not
modify or deploy the installed runtime.

## Scoped slots

`{{GLOBAL_INSTRUCTIONS}}` and `{{WORKSPACE_INSTRUCTIONS}}` place the loader's
verbatim tagged files. An omitted slot leaves that scope in the tail, in loader
order. Repeating either slot fails open. Expansion is single-pass, so placeholder
text inside a file or generated section stays literal. The splice separates
`APPEND_SYSTEM.md` from the core and preserves it even when `{{PI_DOCS}}` is absent.
Unrecognized provenance or boundaries leave the incoming prompt unchanged and
produce a warning. Inspection captures the resulting provider bytes.

The splice compares the incoming core with `originalSystemPrompt` before rewriting.
Unaccounted core prose fails open rather than being dropped. Final payload capture
runs after every transform hook and records the request's model identity. Output
tests capture each provider request explicitly and link the final request's artifact
from the result. Without a provider observation, the model label is `unobserved`.
