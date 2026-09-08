# sysprompt-editor design

Status: as built 2026-09-05.

## Ownership

Pi's loader decides which instruction files apply. The editor reads each file's
scope from where the loader found it: the agent directory (lexical or real
path) is global, any other directory is workspace. It neither discovers instruction files nor infers scope
from prose. Template selection belongs to one session branch. Model changes have
no role in selection. The extension runs on stock Pi and pins one release in
`lib/stock-core.ts`; `docs/adr/0006` records why it stopped requiring a patch.

## Assembly

Stock Pi gives `before_agent_start` the prompt as earlier extensions left it, not
the original. `lib/stock-core.ts` rebuilds the stock core from the event's inputs
and the package's documentation paths, and the splice proceeds only when the
incoming core equals it. That rejects unaccounted core changes before rewriting.
`lib/splice.ts` separates the stock core, explicit append, and remaining tail.
`lib/instructions.ts` matches Pi's complete `<project_context>` container before
scanning the rest of the tail for skills. Loaded file contents remain opaque.
Global and workspace slots consume their blocks once; omitted slots leave those
files in the tail, in loader order, inside an `<instruction_context>` container.
Repeating either instruction slot fails open. Expansion makes one pass over
template source so generated content cannot expand a slot.

`APPEND_SYSTEM.md`, working directory, and unrelated extension additions remain
in the prompt. Custom system cores bypass rewriting. Unknown boundaries or a
core that differs from the mirror preserve the incoming prompt. Normal-turn
warnings are deduplicated by session and reason and reset after recovery. The
warning goes to UI or stderr.

## Selection state

The schema and restoration rules are in `~/.agents/kit/docs/DATA_MODEL.md`.
Restoration happens when a turn or selection command needs it, so tree navigation
cannot leave a stale cached name. The trade-off is recorded in
`~/.agents/kit/docs/adr/0004-pin-template-names-with-live-contents.md`.

`initializeSelection` reads `.active` only when the branch has no entry. The default
fallback is `default.md`. The selected name is saved before first use. A switch
validates that the file is readable, appends state, then reports success. Pi
records a custom entry in memory before writing it and writes it with the first
assistant message, so a switch before any reply is held in memory until then
(the switch says so), and a failed write leaves this process pinned to a
selection the session file lacks; the switch reports that case as memory-only. In-memory SDK sessions keep
state for their lifetime without claiming disk storage.

Each render rereads the pinned file. Removing it leaves the name in session state
and preserves the incoming prompt. Recreating it recovers without switching.
Template contents and prompt history are not stored in the selection entry.

## Inspection and output tests

The immediate dump is a command-time input inventory, including the core source
(`stock` or `custom`; Pi does not tell extensions whether a custom core came from
a file). An armed `before_provider_request` observer captures the payload as it
stands when this extension's handler runs, with the session's model at request
time. Pi runs those handlers in load order, so the kit's manifest lists this
extension after the ones that edit prompts. Providers must call
`options.onPayload`; a turn ending without a payload cancels the arm and warns.
The optional bridge wire capture records downstream system bytes separately.

The output test sends its fixture through a normal session turn and records the
final reply. Tool-use turns leave it pending. The command refuses a busy session
or a second pending test. Results identify the template bytes that rendered. The
command also arms provider capture. Both artifacts include selection,
fallback/bypass reason, scoped input hashes, core source, and the provider-text
hash. Output tests capture each provider request and link the final capture from
the result. Model labels come from that request; without an observation the
result says `unobserved`. Capture state is instance-local and clears on session
replacement or tree navigation.

## Request observations

`sysprompt-editor:request` is a versioned display-only custom entry for each
`before_provider_request` observation. `RequestRecord` distinguishes captured
JSON from an unavailable observation; `PreviewRecord` is transient. JSON
serialization detaches saved data before later handlers can mutate it. A
`turn_start`/`turn_end` pair without an observation records the gap. Capture or
storage failure leaves the request pipeline running.

The entry ID is the history identity. Pi owns persistence and branch traversal;
the viewer reads the active branch rather than keeping a second history. Source
inventories are saved alongside the payload so a later template edit cannot
relabel an earlier request. Unknown payload shapes retain their complete JSON.
The extracted sections are convenience views, with Raw as the audit fallback.

`registerEntryRenderer` renders a collapsed card. Its component owns local
expansion; Pi's global expansion changes override that state. Header clicks route
through Pi's custom-entry container. `/sysprompt view` supplies a bounded custom
viewport with section selection and scrolling, plus a history picker. Neither
surface sends messages. The current preview reconstructs Pi's loaded inputs using
the pinned core mirror and public skill formatter, then applies the live selected
template without initializing or changing selection state.

The persistence cost is one complete serialized request per observation, with
no redaction or deduplication. Requests can contain sensitive context beyond the
system prompt. The UI identifies the observation boundary and does not claim
transport-level fidelity or complete source attribution.

## Verification

`scripts/verify.sh` checks formatting, types, unit tests with artifact goldens,
and conformance. `conformance/mirror.test.ts` compares the stock mirror with the
published package's `buildSystemPrompt` and pins its `VERSION`; the other
conformance suites run real resource loading, `AgentSession`, disk-backed
`SessionManager` lifecycle, and a faux provider with no network transport. These
checks establish assembly and selection behavior; they do not establish a
preferred layout or model compliance. A Pi release that changes the core prose
fails the mirror suite and the runtime fails open until the mirror is re-pinned.

## Boundaries

Prose editing stays in ordinary files. Model routing and per-turn prompt archiving
are outside this extension. Captured provider bytes support reproduction; an
uncaptured historical turn cannot be recovered from a pinned name after edits.
