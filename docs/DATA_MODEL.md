# Data model

## System-prompt selection

The authoritative schema is `SavedSelection` in
`~/.agents/kit/extensions/sysprompt-editor/lib/selection.ts`.

| Field | Meaning |
| --- | --- |
| `version` | Schema discriminator, currently `1`. |
| `name` | Template filename matching `[a-z0-9-]+.md`, relative to the shared template directory. |

Pi stores this value in a `custom` session entry with custom type
`sysprompt-editor:selection`. The newest matching entry on the active branch wins.
The entry references live template contents; it stores neither contents nor hashes.
A malformed entry blocks rendering until a valid switch repairs the branch.
An absent entry permits initialization from the default pointer.

## Loaded instruction file

Pi's loader reports each file as `{ path, content }`. The editor's
`InstructionFile` in `~/.agents/kit/extensions/sysprompt-editor/lib/instructions.ts`
adds `scope`, recovered from the directory holding the file: the agent directory
is `{ kind: "global" }`, any other is `{ kind: "workspace", directory }`.

The loader's array order preserves global then ancestor-to-descendant precedence.
Inspection records each file's scope, directory where applicable, and content hash.
These are evidence about a capture, not another instruction store.

## Prompt provenance

`CoreSource` is `stock` or `custom`; Pi does not tell extensions whether a custom
core came from a file. The baseline for detecting chained core edits is the
stock core rebuilt from `before_agent_start.systemPromptOptions` by
`~/.agents/kit/extensions/sysprompt-editor/lib/stock-core.ts`. The
`before_provider_request` event supplies the payload as it stands at this
extension's load position, labelled with the session's model at request time.
The editor's `PromptEvidence` type in
`~/.agents/kit/extensions/sysprompt-editor/lib/evidence.ts` records those facts
and content hashes for explicit captures and output tests.

## Prompt preview

`PromptPreview` in `~/.agents/kit/extensions/sysprompt-editor/lib/viewer-ui.ts`
holds reconstructed `instructions` and a `sources` inventory. The view command
creates it from Pi's loaded prompt inputs and the live template. It belongs to
the open viewport and is discarded on close, without session entries or files.
It does not represent an observed provider request or change template selection.
