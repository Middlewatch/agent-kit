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
