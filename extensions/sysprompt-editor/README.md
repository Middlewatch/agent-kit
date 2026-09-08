# sysprompt-editor

A Pi extension for editable system-prompt cores, scoped instruction placement,
and request inspection in the transcript.
The harness supplies live data; templates supply prose and layout. See the scoped
slot contract below. The authoring guide and model-family examples are at
`~/.agents/kit/guidance/sysprompt/AUTHORING.md`. The extension runs on stock Pi;
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

## The `/sysprompt` command

`/sysprompt` opens a menu of five actions; `/sysprompt <action>` jumps
straight to one. Cancelling any picker ends the command with no write.

- `switch`: pick the session template, or use `/sysprompt switch name.md` headlessly.
- `new`: name a template (`[a-z0-9-]+`) and create it as a byte copy of the
  currently active one; existing files are never overwritten.
- `view`: opens the latest captured request, or a current preview before the
  first capture. `/sysprompt view history` picks an earlier request on the active
  branch; `/sysprompt view preview` rebuilds the preview. Viewing sends no message.
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

## Request viewer

Each observed provider request adds a collapsed transcript card, including tool
continuations. Click its header in fullscreen mode to expand or collapse the
instruction text; Pi's tool-expansion keybinding (default Ctrl+O) also controls
cards. `/sysprompt view` opens the scrollable viewer in either TUI mode:

- `1`–`5` or Tab select Instructions, Sources, Messages, Tools, and Raw.
- Arrow keys, `j`/`k`, Page Up/Down, Home/End, or the mouse wheel scroll.
- `h` opens history, `p` builds a current preview, and Escape closes the viewer.

Instructions extracts recognized system/developer fields. Messages retains all
recognized message arrays, including user and tool content that can carry
instructions. Raw shows the complete observed JSON payload, including unfamiliar
fields. Sources lists loaded file paths and hashes; it is an inventory, not
attribution of every payload byte. Extension additions and unmatched text remain
unattributed. Terminal control sequences are removed for display; saved JSON is
unchanged.

A capture is an observation at this extension's hook, not a transport receipt or
proof the server accepted it. A turn without an observation gets an explicit
unavailable card. The current preview uses Pi's loaded inputs and the live
selected template; it omits per-turn extension and provider changes. Reload Pi
to refresh loaded instruction files. Preview never replaces a saved capture or
persists a template selection.

Captures live in display-only session entries. They survive resume and follow the
active branch through fork and tree navigation. They never enter model context.
Pi's first-reply persistence rule above also applies to captures. Session files
now contain full request copies, potentially including sensitive messages,
images, and tool results. There is no redaction or deduplication, so long sessions
use more disk space. Treat session exports and sharing accordingly.

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
- `lib/viewer.ts`: versioned request observations and provider-field views.
- `lib/viewer-ui.ts`: transcript cards and the on-demand viewport.
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
