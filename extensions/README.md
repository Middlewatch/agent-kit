# Extensions

Pi extensions that ship with the kit. Each top-level directory is one
extension; the kit's `package.json` lists their entry points, so `bin/install`
registering the kit as a pi package loads all of them. Anything with its own
release cadence (`autojournal`, `claude-go`, `context-fold`) lives in its own
repo and is installed separately.

- `pageview`: serves browser artifacts (HTML, SVG, PDF) from the session cwd
  to a remote browser over the tailnet; spec at
  `docs/specs/2026-08-21-pageview.md`.
- `pi-scratchpad`: session-scoped scratch directory exported as
  `$PI_SCRATCHPAD`.
- `agent-delegate`: the depth-one `delegate` tool: explore, review, and
  research children, named agent definitions, and worktree-jailed writers.
- `pi-tui`: the owner's TUI layer: gutter tool rendering, labeled footer,
  fade-glyph header, progress widget, `/edit` into neovim, and the
  modus-vivendi-tinted theme; spec at `docs/specs/2026-08-30-pi-tui.md`.
- `prompt-picker`: `/prompt` picker over the kit's `prompts/` library with
  live preview; inserts the chosen template into the editor.
- `skill-inline`: expands `/skill:name` on any line of a prompt, several per
  prompt, so text can frame a skill before and after it.
- `pi-config`: `/config` picker that enables or disables extensions, skills,
  prompts, and themes in global or project scope, writing what `pi config`
  writes, then reloads.
- `prompt-sections`: appends the local CLI roster to pi's stock `<tools>`
  section and drops the stock `<rules>` listed in `guidance/rules-drop.txt`,
  in place.
  `/sysprompt` shows the prompt as sent, or a preview before the first turn.

Each extension keeps its README in its directory, with tests and a design
doc where the extension is large enough to need them. Tests run in the
extension's directory:

- `npm test` for pi-scratchpad, pageview, agent-delegate, and pi-tui
- `node --test lib.test.ts` for prompt-picker, skill-inline, and pi-config
- `npm test` and `npm run typecheck` for prompt-sections
