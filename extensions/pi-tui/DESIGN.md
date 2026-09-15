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
| `estate.ts` | none | async filesystem counts, tested against fixtures |
| `progress-widget.ts` | `parseTaskLines`, `applyItems`, `buildProgressWidgetLines` | event wiring in-file |
| `edit-targets.ts` | `discoverEditRoots`, `scanMarkdown`, `filterTargets` | none |
| `edit-command.ts` | none | two-level picker + command wiring |
| `editor.ts` | `editorCommand` | `suspendAndEdit` |
| `copy.ts` | `extractSelection`, `fencedBlocks`, `mapCodeRows` | `installTranscriptCopy` |

## Decisions that surprised the spec

- **Every override supplies its own `execute`.** pi resolves *render*
  slots per slot (an override without `renderCall` keeps the built-in's),
  but `execute` is required on every registered tool. Each override
  delegates to a per-call `createXToolDefinition(ctx.cwd)` instance.
  Spreading that definition preserves Pi's prompt metadata and argument
  shims; the executable `createXTool` wrappers omit prompt metadata for
  most tools. Registration tests compare all seven overrides with Pi's
  definitions, and an execute test checks file operations in the session cwd.
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
- **The progress widget reads assistant text, not a tool.** Task-list
  lines in replies are the source, so the agent spends no tool calls on
  bookkeeping and no schema rides every request. Session history showed
  the earlier todo tool was write-only (85% `status` updates, `list`
  called once), so tracking moved to prose the guide already asks for.
  The list replays from the branch after resume and fork.
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

- **Transcript copy overrides one private renderer method.** pi's
  fullscreen drag-select copies a slice of the rendered scroll content
  (`TuiAltScreen.getActiveSelectionText`), which is why copied code
  carries the message margin and the markdown code-block indent. The
  `tui` handle pi passes to header, footer, and custom factories is a
  proxy whose `set` trap writes through to the live renderer, so the
  footer's render installs an own-property override on the instance;
  pi's release handler, `Ctrl+X`, and its clipboard delivery all call
  through it. `getSelectionBounds`, `currentLayout`, and the method
  itself are private in the type declarations but plain properties at
  runtime, so the override wraps everything in a fallback to pi's text.
  A TUI mode change creates a fresh renderer; the install marker lives on
  the instance, and the footer renders every frame, so the swap is
  covered without an event.
- **Rows map to source by replaying the layout, then validating.** The
  layout frame stops at pi's document `Container` (plain containers are
  not layout nodes), so the walk descends `children`, locating each
  child's rendered lines inside its parent's from the stacked position
  (pi's tool component paints a blank row before its container in
  self-shell mode, so plain height sums would drift by one). Renders
  along the way are cached by their components. A `Markdown` leaf
  exposes its source, and each fenced block is replayed the way the
  renderer paints it (fence, `codeBlockIndent` plus line through
  `wrapTextWithAnsi`, fence); a block claims rows only when every row
  matches the painted text, and every row is checked against the scroll
  content before its leaf is trusted. Anything unmatched (a parent that
  rewrites lines, nested fences, streaming partials) falls back to pi's
  slice for that row. pi aliases `@earendil-works/pi-tui` to its own
  copy for extensions, so the replay wraps with the renderer's code.

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
filesystem. Estate bindings can resolve to network mounts, so every count
uses asynchronous filesystem APIs. The header starts a refresh at creation
and checks every 30 seconds, with at most one refresh pending. It renders
cached counts and requests a redraw only when the snapshot changes.
Disposal or session shutdown stops the timer and ignores late results.

The extension registers everything at load and only touches the TUI inside
`ctx.mode === "tui"` guards, so print/RPC/JSON modes see the built-in behavior
plus unchanged tool execution.
