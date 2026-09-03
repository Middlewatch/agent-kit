# Extensions

Pi extensions that ship with the kit. Each top-level directory is one
extension; the kit's `package.json` lists their entry points, so `bin/install`
registering the kit as a pi package loads all of them. Anything with its own
release cadence (`autojournal`, `claude-go`, `context-fold`) lives in its own
repo and is installed separately.

| extension | what it does |
|---|---|
| `pi-interlock` | pre-execution seatbelt with an audit trail: denies direct credential access and machine-level catastrophes, asks before boundary-crossing deletes and consequential pushes, allows everything else. It is security-sensitive, and `AGENTS.md` holds its review rules |
| `pageview` | serves browser artifacts (HTML, SVG, PDF) from the session cwd to a remote browser over the tailnet; spec at `docs/specs/2026-08-21-pageview.md` |
| `pi-scratchpad` | session-scoped scratch directory exported as `$PI_SCRATCHPAD` |
| `agent-delegate` | the depth-one `delegate` tool: explore, review, and research children, named agent definitions, and worktree-jailed writers |
| `pi-tui` | the owner's TUI layer: gutter tool rendering, labeled footer, fade-glyph header, todo widget, `/edit` into neovim, and the modus-vivendi-tinted theme; spec at `docs/specs/2026-08-30-pi-tui.md` |
| `prompt-picker` | `/prompt` picker over the kit's `prompts/` library with live preview; inserts the chosen template into the editor |
| `pi-config` | `/config` picker that enables or disables extensions, skills, prompts, and themes in global or project scope, writing what `pi config` writes, then reloads |
| `sysprompt-editor` | rebuilds Pi's core system prompt from the owner-authored templates in `guidance/sysprompt/`, with live harness data spliced in. `/sysprompt` switches, scaffolds, inspects (byte-exact provider capture), and output-tests templates. It fails open to the stock prompt |

Each extension keeps its README in its directory, with tests and a design
doc where the extension is large enough to need them (`todo` is a single
file with a README only). Tests run in the extension's directory:

- `npm run test:unit` for pi-interlock
- `npm test` for pi-scratchpad, pageview, agent-delegate, and pi-tui
- `node --test lib.test.ts` for prompt-picker and pi-config
- `scripts/verify.sh` for sysprompt-editor
