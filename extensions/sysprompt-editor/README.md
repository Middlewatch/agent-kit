# sysprompt-editor

A Pi extension for editable system-prompt cores, scoped instruction placement,
and disposable instruction inspection.
The harness supplies live data; templates supply prose and layout. See the scoped
slot contract below. The authoring guide and model-family examples are at
`~/.agents/kit/guidance/sysprompt/AUTHORING.md`. Tool summaries and runtime
guidelines come from active registrations' `promptSnippet` and
`promptGuidelines`. A tool without a snippet remains available through its
full API description and schema, but Pi omits it from the prose tool list.
Conformance tests load the kit's actual gutter overrides and verify their
metadata through every shipped template, alongside custom-tool load order
and active-tool changes between turns.

The extension runs on stock Pi;
the pinned release is named in `lib/stock-core.ts`.

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

Pi writes custom entries to the session file together with the first assistant
message. A switch made before any reply is held in memory until then and says
so ("saved with the first reply"); quitting first loses it, and the next session
starts from the `.active` pointer again. A switch whose write fails is reported
as memory-only for the same reason.

## Tool-activation timing

Pi 0.85.1 snapshots prompt inputs before running `before_agent_start` handlers.
If a handler changes active tools during that event, the tool schemas update
but a rewritten prompt can retain the old summaries and guidelines until the
next turn. This applies even when the tool-changing handler runs before the
editor, since the event still carries the original snapshot.

Set initial availability in `session_start`, or change it between turns.
The question-tool integration uses the early hook for startup and retains its
per-turn UI check; mid-turn or startup-hook changes still have the limitation
above. The editor leaves Pi and provider payload formats unchanged.

## The `/sysprompt` command

`/sysprompt` opens a menu of five actions; `/sysprompt <action>` jumps
straight to one. Cancelling any picker ends the command with no write.

- `switch`: pick the session template, or use `/sysprompt switch name.md` headlessly.
- `new`: name a template (`[a-z0-9-]+`) and create it as a byte copy of the
  currently active one; existing files are never overwritten.
- `view`: opens a disposable preview of the loaded instructions and selected
  template, including before the first message. Viewing sends no message and
  saves no files or session entries.
- `inspect`: writes a command-time inventory, then captures the next provider
  system text as readable `.md` and extracted `.txt` in `artifacts/inspect/`.
  Multiple provider text blocks are joined with blank lines. The metadata records
  selected and rendered names, template and provider-text hashes, fallback/bypass
  reason, core source (`stock` or `custom`), and each loaded instruction file's
  scope and content hash. On `claude-go` with `CLAUDE_GO_CAPTURE_DIR` set, a
  separate wire capture can reveal downstream system-text changes.
- `test`: sends "Summarize this article for me." with
  `fixtures/output-test-document.md` through the normal pipeline, captures its
  provider prompt, and writes the reply to
  `artifacts/output-tests/<stamp>-<provider>-<model>.md` with render provenance.
  Refused while the agent is busy or another output test is pending.

Provider capture rides Pi's `before_provider_request` event, which a custom
provider only emits if its `streamSimple` calls `options.onPayload`. If a
turn ends without the event, the capture is cancelled with a warning. Pi runs
that event's handlers in extension load order, so a payload transform registered
by a later extension is not in the capture; the kit's manifest order puts this
extension after the ones that edit prompts. The model label is the session's
model at request time.

## Disposable prompt viewer

Open `/sysprompt` and choose `view`, or run `/sysprompt view` directly. The
scrollable preview works in regular and fullscreen TUI modes:

- `1`, `2`, or Tab switch between Instructions and Sources.
- Arrow keys, `j`/`k`, Page Up/Down, Home/End, or the mouse wheel scroll.
- Escape or `q` closes the viewer and discards the preview.

The preview uses Pi's loaded inputs and the live selected template. It has not
been sent and omits per-turn extension and provider changes. Sources lists loaded
file paths, template and instruction hashes, and any rendering fallback. Reload
Pi to refresh loaded instruction files. On an unpinned Pi version, reconstruction
is unavailable; the loaded-source inventory remains viewable. Terminal control
sequences are removed for display.

Opening the viewer never initializes a template selection, adds a transcript
notice, or captures a request. Ordinary turns and tool continuations create no
inspection archive. Existing request captures in old session files remain
untouched but are no longer rendered or read by the viewer. The separate
`inspect` and `test` commands still create diagnostic files when explicitly run.

## Layout

- `index.ts`: hook and command registration; logic lives in `lib/`.
- `lib/stock-core.ts`: Pi's stock core, instruction container, and scope
  rules, mirrored from the pinned release.
- `lib/splice.ts`: tail split, anchor extraction, template render.
- `lib/instructions.ts`: scoped instruction blocks and slot placement.
- `lib/templates.ts`: template files, initial-default pointer, and scaffold.
- `lib/selection.ts`: versioned selection parsing and branch restoration.
- `lib/inspect.ts`: immediate dump, payload extraction, armed capture,
  artifact naming. Capture arms belong to one extension instance.
- `lib/viewer-ui.ts`: disposable instruction and source viewport.
- `lib/evidence.ts`: scoped input inventories and content hashes.
- `lib/output-test.ts`: output-test prompt, result naming and format.
- `fixtures/golden/`: input/expected pairs that pin the artifact formats
  byte for byte.
- `conformance/`: the real-pipeline suite against the published Pi package.
- `patches/`: the retired companion Pi patch, kept as a record of the
  loader-side contract the extension once required.

`DESIGN.md` is the design basis. `scripts/verify.sh` is the definition of
green (Node 22.6+, `npm ci`, prettier, tsc, unit tests, conformance). Captures
remain local; no model-compliance score is produced.

## Stock compatibility

Stock Pi hands `before_agent_start` the assembled prompt as earlier extensions
left it, plus the structured inputs it was built from, and reports loaded
instruction files as `{ path, content }` inside one `<project_context>`
container. The extension supplies what the event lacks:

- Core provenance. `lib/stock-core.ts` rebuilds Pi's core from the same inputs
  and the package's documentation paths. The splice runs only when the incoming
  core equals that reconstruction byte for byte. An insertion by an earlier
  extension, inputs that disagree with the prompt, or a Pi release with changed
  prose all fail open with a warning that names the pinned and running versions.
- Instruction scope. The file Pi loaded from its agent directory (`getAgentDir()`,
  matched in lexical and real-path form) is global; every other file is
  workspace, scoped to the directory holding it, which is how the loader found
  it. The stock container is lifted from the tail
  and each file is rendered once as `<global_instructions>` or
  `<workspace_instructions>`, into a template slot or, for an omitted slot, into
  an `<instruction_context>` container left in the tail in loader order.

Conformance runs `npm run test:conformance`: `conformance/mirror.test.ts` compares
the mirror with the package's own `buildSystemPrompt` across tool sets and checks
`VERSION` against the pin; the other suites drive the real loader, an
`AgentSession`, disk-backed `SessionManager` lifecycle, and a faux provider
recording the payload at its serialization boundary. A Pi upgrade whose core
prose changed goes red there; re-pin `lib/stock-core.ts` from the new source
after reviewing the diff, and the runtime resumes rendering.

## Scoped slots

`{{GLOBAL_INSTRUCTIONS}}` and `{{WORKSPACE_INSTRUCTIONS}}` place the loaded files
verbatim, tagged with path and scope. An omitted slot leaves that scope in the
tail, in loader order. Repeating either slot fails open. Expansion is single-pass,
so placeholder text inside a file or generated section stays literal. The splice
separates `APPEND_SYSTEM.md` from the core and preserves it even when `{{PI_DOCS}}`
is absent. Unrecognized boundaries leave the incoming prompt unchanged and produce
a warning. Inspection captures provider system text at the inspection hook. Output tests capture
each provider request explicitly and link the final request's artifact from the
result. Without a provider observation, the model label is `unobserved`.
