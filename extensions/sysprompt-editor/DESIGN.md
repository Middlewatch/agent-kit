# sysprompt-editor design

Status: as built 2026-09-04.

## Ownership

Pi's loader decides which instruction files apply and records their authority.
The prompt builder tags global and workspace files for stock and custom cores.
The editor reads this metadata; it neither discovers instruction files nor infers
scope from prose. Template selection belongs to one session branch. Model changes
have no role in selection.

## Assembly

The runner's `originalSystemPrompt` lets the editor reject unaccounted core changes
before rewriting. `lib/splice.ts` separates the stock core, explicit append, and
remaining tail.
`lib/instructions.ts` matches the complete scoped container before scanning the
rest of the tail for skills. Loaded file contents remain opaque. Global and
workspace slots consume their blocks once; omitted slots leave those files in the
tail, in loader order. Repeating either instruction slot fails open. Expansion
makes one pass over template source so generated content cannot expand a slot.

`APPEND_SYSTEM.md`, working directory, and unrelated extension additions remain
in the prompt. Custom system cores bypass rewriting. Unknown boundaries or
provenance preserve the incoming prompt. Normal-turn warnings are deduplicated by
session and reason and reset after recovery. The warning goes to UI or stderr.

## Selection state

The schema and restoration rules are in `~/.agents/kit/docs/DATA_MODEL.md`.
Restoration happens when a turn or selection command needs it, so tree navigation
cannot leave a stale cached name. The trade-off is recorded in
`~/.agents/kit/docs/adr/0004-pin-template-names-with-live-contents.md`.

`initializeSelection` reads `.active` only when the branch has no entry. The default
fallback is `default.md`. The selected name is saved before first use. A switch
validates that the file is readable, appends state, then reports success. The
companion Pi change writes custom entries before committing them to memory,
including before the first assistant response, and rolls back partial writes.
In-memory SDK sessions keep state for their lifetime without claiming disk storage.

Each render rereads the pinned file. Removing it leaves the name in session state
and preserves the incoming prompt. Recreating it recovers without switching.
Template contents and prompt history are not stored in the selection entry.

## Inspection and output tests

The immediate dump is a command-time input inventory, including the effective
core source. An armed `provider_request` observer captures the final payload after
all transforms. Pi gives each observer an isolated snapshot and request-time model
identity; observer mutations cannot alter the request. Providers must
call `options.onPayload`; a turn ending without a payload cancels the arm and
warns. The optional bridge wire capture records downstream system bytes separately.

The output test sends its fixture through a normal session turn and records the
final reply. Tool-use turns leave it pending. The command refuses a busy session
or a second pending test. Results identify the template bytes that rendered. The command also arms provider
capture. Both artifacts include selection, fallback/bypass reason, scoped input
hashes, core source, and the provider-text hash. Output tests capture each provider
request and link the final capture from the result. Model labels come from that
request; without an observation the result says `unobserved`. Capture state is instance-local and clears on
session replacement or tree navigation.

## Verification

`scripts/verify.sh` checks formatting, types, and unit/artifact goldens.
`scripts/conformance.mjs` runs real resource loading, AgentSession, disk-backed
SessionManager lifecycle, and a recording provider against the patched Pi source.
The provider has no network transport. These checks establish assembly and
selection behavior; they do not establish a preferred layout or model compliance.

## Boundaries

Prose editing stays in ordinary files. Model routing and per-turn prompt archiving
are outside this extension. Captured provider bytes support reproduction; an
uncaptured historical turn cannot be recovered from a pinned name after edits.
