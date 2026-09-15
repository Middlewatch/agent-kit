# Authoring system-prompt templates

A system-prompt template supplies role prose and arranges live instruction blocks.
It is separate from Pi's slash-command prompt templates, which send user messages.
The implementation and verification commands are in
`~/.agents/kit/extensions/sysprompt-editor/README.md`.

## Where instructions belong

| Content | Source |
| --- | --- |
| Owner preferences, approval gates, communication, and prose policy | Global `~/.agents/kit/guidance/AGENTS.md`, loaded by Pi through the installed global guide. |
| Workspace rules | That workspace's instruction files, discovered by Pi's loader. |
| Model-specific phrasing and section order | The chosen template in this directory. |
| Tools, skills, runtime guidelines, Pi documentation, working directory, scratchpad location | Generated slots below. |

Keep owner policy in the global guide and place it with `{{GLOBAL_INSTRUCTIONS}}`.
The template chooses placement; the loader decides authority. Generated global
blocks are not project-specific instructions. Workspace blocks name the directory
where they apply, in ancestor-to-descendant order. The tag labels express that
scope within Pi's system text; they do not create new provider message roles.

## Start and select

Copy [starter.md](starter.md) to a filename matching `[a-z0-9-]+.md`. Edit it in your
usual editor, then run `/sysprompt switch name.md` or use the interactive switch
picker. `/sysprompt new` instead copies the session's selected template and leaves
the selection unchanged.

The session stores the filename, not a snapshot. Resume restores it and fork
inherits the selection at the branch point. Model switching leaves it unchanged;
select a different template explicitly when comparing models. Edits reach every
session using that file on its next turn.

`.active` is a gitignored initial-default pointer. A branch with no saved selection
reads it, falls back to `default.md` if needed, and saves the resolved name before
use. A switch never writes this pointer. If a pinned file goes missing, the session
keeps its name and uses the incoming Pi prompt until the file returns or you switch.

## Slots

Expansion runs once over template source. Literal placeholder text inside an
instruction file, generated section, or fenced example stays literal. The editor
preserves instruction-file contents, including whitespace and Markdown fences.

| Slot | Generated value | If omitted |
| --- | --- | --- |
| `{{GLOBAL_INSTRUCTIONS}}` | Loaded global files with path and scope tags. | Those files remain in the tail. |
| `{{WORKSPACE_INSTRUCTIONS}}` | Workspace files with path and applicable directory tags. | Those files remain in the tail, in loader order. |
| `{{AVAILABLE_TOOLS}}` | Current tool summary lines. | Summary omitted; registered tool definitions are unchanged. |
| `{{GUIDELINES}}` | Current harness and extension guideline lines. | Guideline prose omitted. |
| `{{SKILLS}}` | Pi's generated skills instructions and catalog. | Skills stay in the tail. |
| `{{PI_DOCS}}` | Pi's installed documentation pointers. | Documentation pointers omitted. |
| `{{PI_SCRATCHPAD}}` | Session scratchpad guidance; empty if unset. | Scratchpad prose omitted. |
| `{{LOCAL_TOOLS}}` | The `## Advertised` bullets of `~/.agents/system-tools-index.md`, minus names not on PATH; empty if the file or section is missing. | Local tool roster omitted. |
| `{{SESSION_CONTEXT}}` | Pi's working-directory line, matched against its `cwd` input. | The original line stays in the tail. |
| `{{APPENDED_INSTRUCTIONS}}` | Pi's explicit append text inside `<appended_instructions>`; empty if unset. | The original append stays in the tail. |

Place global, workspace, session-context, and appended-instruction slots at most
once. Repeating one preserves the incoming prompt and reports a warning. Use other
generated slots once as well to keep the prompt readable. Unknown placeholder
names remain literal.

The editor preserves `APPEND_SYSTEM.md` and programmatic append text independently
of `{{PI_DOCS}}`. A custom `SYSTEM.md`, `--system-prompt`, or SDK custom core bypasses
template rewriting without an error. A core that differs from Pi's own
construction, malformed saved state, failed selection persistence, and
unrecognized boundaries preserve the incoming prompt. Ordinary turns warn through UI or stderr when the reason first occurs or
changes; successful rendering clears that warning state.

## Baseline layout

`owner.md`, `default.md`, and `starter.md` use the same XML boundaries:
role, global instructions, runtime, optional appended instructions, workspace
instructions, then session context. Their role prose differs.

Runtime groups tool summaries with their guidelines, followed by Pi's intact
skill catalog and documentation pointers. Session context holds the working
directory and scratchpad guidance. Each loaded instruction file keeps its source
path and scope tags; its Markdown remains verbatim. These are descriptive
boundaries, not a requirement that embedded source text be XML-escaped.

A placed session footer must match Pi's `cwd` input after its leading skill
catalog. A missing or unfamiliar footer preserves the incoming prompt. Unclassified
extension additions stay outside the template in their original order and bytes.
Reload Pi after an editor code change; template-only edits take effect next turn.

## Examples and evidence

These layouts are editable examples. Their order has not been measured against
this repository's tasks. Provider advice is evidence for trying a structure,
not proof that the example improves instruction following.

- [owner.md](owner.md), [default.md](default.md), and [starter.md](starter.md)
  use the baseline layout above. General instructions precede capability catalogs;
  workspace and session-specific text come later. This is an evaluation baseline,
  not a measured instruction-following improvement.
- [claude-example.md](claude-example.md) uses descriptive XML sections. Anthropic's
  [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices),
  accessed 2026-09-04, recommends clear instructions and XML tags to separate mixed
  content. Its general guidance covers current Claude models, including Opus 4.6,
  Sonnet 4.6, and later models named on the page. This example borrows that structure;
  it is not a version-specific tuning result. Anthropic's long-document ordering
  advice concerns data and queries and does not establish where owner policy belongs.
- [openai-example.md](openai-example.md) uses Markdown headings with generated scoped
  tags. OpenAI's [Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering),
  accessed 2026-09-04, recommends Markdown/XML boundaries and describes identity,
  instructions, examples, and context as common sections. The page's current examples
  include `gpt-6-astra`; the advice is general rather than a pinned-snapshot result.
  No publication date is stated on either source page. Recheck the provider guide
  and run local evaluations for the exact model version you use.

## Inspect and compare

Run `/sysprompt inspect`, then send a normal message. The immediate inventory names
selected state and scoped input hashes at command time; it is not an assembled
prompt. The provider `.md` records the selected and rendered names, template hash,
fallback or bypass reason, core source (stock or custom), and each loaded
file's scope and content hash. Capture sees the payload at this extension's
position in Pi's extension load order; the kit lists it after the extensions
that edit prompts. The
`.txt` contains extracted system text; multiple provider text blocks are joined
with blank lines. The optional bridge wire capture can reveal downstream changes.

`/sysprompt test` sends the bundled article through an ordinary turn and captures
its provider prompt plus final response. The result names the provider and model
and records the same provenance. It captures each provider request and links the
final request's artifact; model labels come from that request rather than command
time. An unobserved request is labeled `unobserved`. Compare captures before judging the responses:
check each instruction file appears once, global and workspace order, tools and
skills, and the fallback field. Then compare task outcomes with the same model,
fixture, and settings. A successful assembly test says nothing about compliance.

Captures are explicit and can contain private instructions. Keep them local unless
the owner approves sharing. Changing a live template destroys the ability to infer
old prompt bytes from its name alone; retain the explicit capture when exact
reproduction matters. The extension does not archive every turn.

## Runtime requirement

The extension runs on stock Pi and pins one release in its `lib/stock-core.ts`.
After a Pi upgrade that changes the core prose, templates fail open with a
warning naming both versions until the extension is re-pinned; the extension
README describes the check. A template switch made before the first reply in a
session is held in memory until Pi writes the session file.
