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

Pi owns `InstructionFile` in `packages/coding-agent/src/core/instruction-context.ts`.
It carries `path`, verbatim `content`, and loader provenance in `scope`:
`{ kind: "global" }` or `{ kind: "workspace", directory }`.
Legacy SDK-provided context may omit scope. Pi then renders a neutral tag;
the editor requires scope before it can relocate loaded files.

The loader's array order preserves global then ancestor-to-descendant precedence.
Inspection records each file's scope, directory where applicable, and content hash.
These are evidence about a capture, not another instruction store.

## Prompt provenance

Pi's `coreSource` identifies a stock core, inline custom text, or the path of a
custom-core file. `before_agent_start.originalSystemPrompt` preserves the baseline
for checking chained edits. The `provider_request` event exposes isolated final
payload snapshots plus request-time model identity. The editor's `PromptEvidence`
type in `~/.agents/kit/extensions/sysprompt-editor/lib/evidence.ts` records those facts and content hashes for explicit
captures and output tests.
