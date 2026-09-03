# 0002: Fold sysprompt-editor into the kit; its templates are guidance

Date: 2026-09-02
Status: accepted

## Context

`pi-sysprompt-editor` rewrote Pi's core system prompt from owner-authored
templates and lived in its own repo, prepared for public release. Its only
reasons to change are Pi moving its stock prompt (the splice anchors) and the
owner's guide changing voice, and both already drive kit changes. The owner
template restated `guidance/AGENTS.md` prose and filled a placeholder from
the kit's `pi-scratchpad` extension, with nothing to catch drift between the
two repos. The kit's rule is that a separate repo earns its place through a
separate release cadence, and this extension had none.

## Decision

The extension moves into the kit as `extensions/sysprompt-editor/` by subtree
merge, history preserved. The templates leave the extension and live at
`guidance/sysprompt/` beside the global guide: prompt prose is guidance, and a
fork rewrites `owner.md` the same way it rewrites `AGENTS.md`. The standalone
repo is retired; `bin/install` drops its package entry.

## Consequences

One gate, one package entry, and the guide and prompt template are edited in
one tree. The prompt editor is no longer installable without the kit, and the
public `pi-sysprompt-editor` repo is archived rather than maintained.
`extensions/sysprompt-editor/scripts/verify.sh` joins the per-extension
gates. The `/edit` picker in pi-tui now finds templates under
`guidance/sysprompt/` instead of a package's `templates/` directory.

## Considered options

Splitting by ownership (mechanism stays standalone, the kit owns `owner.md`
through a template search path): rejected as a cross-repo contract and a
second gate for one feature, worth it only if the mechanism were being
published on its own.
