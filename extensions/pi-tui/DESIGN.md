# pi-tui design

## Shape

Every visual surface is a pure line builder (`build*Lines(facts, style,
width): string[]`) with a thin wiring layer that collects facts and
hands the builder to pi. Tests feed a tagging fake `Style` (`fg` wraps
text in `<color>…</>`) and assert on literal lines, and width behavior
is asserted with `visibleWidth`. The `Style` type is a structural
`Pick<Theme, "fg" | "bold">`, so real themes satisfy it untouched.

| module | pure part | wiring |
|---|---|---|
| `gutter.ts` | header/gutter/closing line builders | none |
| `tools.ts` | `resultLines`, per-tool `SPECS` | `registerGutterTools` |
| `footer.ts` | three line builders, `stripSelfName` | `chrome.ts` |
| `header.ts` | glyph, centering, fact lines | `chrome.ts` |
| `estate.ts` | fixture-testable fs counts | none |
| `todo-widget.ts` | `buildTodoWidgetLines` | event wiring in-file |
| `edit-targets.ts` | `discoverEditRoots`, `scanMarkdown`, `filterTargets` | none |
| `edit-command.ts` | none | two-level picker + command wiring |
| `editor.ts` | `editorCommand` | `suspendAndEdit` |

## Decisions that surprised the spec

- **Every override supplies its own `execute`.** pi resolves *render*
  slots per slot (an override without `renderCall` keeps the built-in's),
  but `execute` is required on every registered tool. Each override
  delegates to a per-call `createXTool(ctx.cwd)` instance, the same
  built-in implementation, so behavior is unchanged.
- **`renderShell: "self"` answers the background question.** In
  self-shell mode ToolExecutionComponent composes the tool's components
  in a plain Container and never applies the background Box, so no
  theme juggling was needed to kill the color blobs.
- **Durations live in the extension closure.** A `Map<toolCallId, ms>`
  capped at 400 entries holds them rather than tool result `details`,
  because pi warns that overrides must match the built-in details shape
  exactly, and session restores simply omit the duration.
- **The extension count mirrors discovery, and skills come from pi.**
  pi 0.84 exposes loaded skills to extensions (every skill registers a
  `/skill:name` command in `pi.getCommands()`) but no loaded-extension
  list, so `estate.ts` re-reads pi's documented discovery inputs:
  auto-discovery dirs, settings `extensions`, and settings `packages`
  resolved to their npm/git caches, deduped by package identity.
  Swap to the real list if pi grows a `getExtensions()` API.
- **Tool output is muted so assistant prose reads as primary.** pi's
  theme schema has no assistant-message role, so the transcript cannot
  brighten assistant text directly. Instead, the default output path in
  `resultLines` renders in `muted`, leaving assistant prose the only
  full-strength text between tool blocks. Error lines keep `error`, and
  diffs keep their diff colors.
- **The todo widget couples to a contract rather than an extension.** It
  replays the todo tool's result `details` from the branch (the same
  mechanism the todo extension itself uses after forks), so neither
  extension imports the other.
- **Line builders must cache, because pi renders every component on
  every frame.** `Container.render` walks all children with no cache,
  and every input event (each wheel tick in fullscreen mode) forces a
  render, so an uncached builder pays O(its content) per frame. With
  284 tool results in one session that was ~50ms per frame (86ms
  scroll-tick latency, visible lag) against 5ms with `Lines` caching
  by width. `invalidate()` drops the cache, which keeps theme switches
  correct, and state changes rebuild components via `updateDisplay`, so
  staleness cannot hide in the cache.
- **TUI suspend uses pi's own pattern.** The sequence is `tui.stop()`,
  spawn with `stdio: "inherit"`, `tui.start()`, `requestRender(true)`,
  lifted from pi's ctrl+g handler. The `tui` object comes from the
  `ctx.ui.custom()` factory.

## Known coupling

The tool overrides delegate to freshly created default tool instances,
so an extension that overrides a built-in tool's *operations* (SSH,
sandbox, micro-VM) would be silently bypassed if it loads before this
one. No such extension runs in this estate today (pi-interlock gates
via `tool_call` events, which still fire). Revisit the delegation if
one arrives.

## Boundaries

Facts collection guards every filesystem and git read (missing
locations degrade to omitted facts), and render paths never touch the
filesystem. The extension registers everything at load and only touches
the TUI inside `ctx.mode === "tui"` guards, so print/RPC/JSON modes see
the built-in behavior plus unchanged tool execution.
