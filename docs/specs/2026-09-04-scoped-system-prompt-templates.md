# Scoped system-prompt templates

Date: 2026-09-04   Status: building

## Problem

The owner wants editable, model-specific prompt layouts without maintaining
multiple copies of model-independent owner policy. Pi currently presents global
and ancestor instruction files as project instructions. The template editor
leaves those files in an appended layer, and its shared active-template pointer
allows one session's selection to change another session's next prompt.

## Outcome

A session can select an editable template by name, retain that selection across
resume and fork, and render every applicable instruction file exactly once with
its correct scope, regardless of whether the core comes from a template or an
explicit custom system prompt.

A conformance test drives the real Pi resource loader and prompt builder through
the editor and a recording provider. It compares the outgoing prompt against
expected bytes for global, ancestor, and workspace fixtures, then exercises two
sessions with different selections. The same session keeps its selection after
resume, a fork inherits it, and a file edit appears on the next turn. A live
inspection capture checks the selected provider adapter before rollout.

This proves assembly and selection behavior. Cross-model behavioral consistency
requires separate repeated evaluations and is not implied by byte equality.

## Non-goals

- Automatic model-to-template mapping. The owner chooses the template manually.
- Frozen template contents. Sessions pin names and read current file contents.
- Replacing Pi's file discovery or project-trust rules. The loader remains the
  authority on which instruction files apply.
- A prose editor or a second configuration language. Templates remain Markdown.
- A universal best prompt order. Authoring guidance distinguishes provider advice,
  measured behavior on named models, and local hypotheses.
- An estate-wide guidance rewrite in the tooling change. Workspace analysis
  follows after assembly is inspectable and reproducible.
- Publishing, deployment, or paid evaluation runs without owner approval.

## Decisions

### Instruction scope and rendering

Pi's resource loader preserves the origin and directory scope of each loaded
instruction file in its structured prompt inputs. The prompt builder renders a
neutral instruction-context container with distinct global and workspace
instruction blocks, including source paths. Ancestor files retain their loader
order and directory scope; they are not all relabeled as belonging to the current
repository.

The editor consumes this metadata rather than discovering files again or
inferring authority from their prose. Instruction contents remain opaque and
unchanged. Metadata is escaped when rendered into attributes. Other extensions'
appended content remains intact.

Global instructions express owner requirements across models and workspaces.
Workspace instructions specialize local practices while retaining owner approval
boundaries. Labels communicate scope; they do not create native message roles
or guarantee model compliance.

The template contract gains placement slots for global and workspace instruction
blocks. Each applicable block is rendered once. An omitted placement slot retains
its block in the normal appended location; repeated placement slots are rejected
rather than duplicating policy. Existing templates therefore preserve applicable
instructions without requiring an immediate edit.

### Custom system prompts and failure behavior

An explicit custom system prompt continues to replace the core and bypass the
selected editor template. Pi's scope-aware instruction rendering still applies.
Custom system prompts are not newly interpreted as editor templates.

This deliberately changes the editor's existing exclusion of appended instruction
layers. Fail-open remains: if the editor cannot safely recognize the inputs or
render the selected template, it preserves the prompt Pi supplied. A normal-turn
notification identifies the fallback when it first occurs or its reason changes;
headless runs receive a diagnostic on stderr. Inspection also records the reason.
An intentional custom-core override is a bypass, not an error.

### Session selection

A selection stores a template name in Pi's existing session storage. It survives
resume, and a fork inherits the selection present at its branch point. Model
switching does not automatically choose a different template.

Each turn rereads the selected file. Editing that file affects every session
that selected it; selecting a different file affects only the current session.
This is selection isolation, not content isolation.

For a session without a recorded selection, the existing active pointer supplies
the initial default, with the current default-template fallback. Persist the
resolved name before its first use. Subsequent switches write session state rather
than the shared pointer. A missing pinned file produces a visible fallback to Pi's
prompt and retains the name, so restoring the file restores the selection.

Session selection is extension-owned state, separate from model-facing messages.
Restoration follows the active session branch rather than scanning unrelated
branches for the most recent selection. A selection change succeeds only after
its session entry is written; a write failure retains the previous selection and
reports failure. Failed initial persistence or malformed selected state preserves
Pi's prompt with a diagnostic rather than claiming an unsaved or guessed pin.

### Authoring and evidence

Provide a neutral starter template and an authoring guide explaining instruction
ownership, available placement slots, actual SYSTEM.md overrides, live edits,
selection scope, and fallback behavior. Model-family examples are editable
starting points with versioned evidence, not automatic routing rules.

Consolidate owner requirements in global guidance and explicitly state their
model-independent scope. Remove duplicated owner policy from model templates.
Model-specific guidance can change presentation and layout without omitting
applicable owner instructions. Preserve approval boundaries; the rewrite does
not grant new authority for external actions.

Inspection identifies the effective core source, session selection, actual
rendered template digest when applicable, instruction sources and scopes, and
fallback reason. Its authoritative artifact remains the final provider payload,
not a reconstruction from the selected template. Captured prompt bytes are the
reference when live source files later change. Reproduction is supported for
conformance fixtures and explicitly captured turns. Uncaptured historical turns
cannot be reconstructed from a pinned name alone; automatic per-turn prompt
archiving is outside this change.

## Seams under test

- Real loader to structured prompt inputs: global versus ancestor provenance,
  source order, no global file, alternate supported instruction filenames,
  linked paths, nested workspaces, and linked worktrees.
- Prompt builder through editor to recording provider: stock core, an actual
  discovered SYSTEM.md, and a separately supplied CLI/programmatic custom core;
  placement and omission, duplicate-slot rejection, opaque document contents,
  unrelated extension additions, and exact preservation on unsupported inputs.
- Real session lifecycle: independent selections, initial defaults, resume,
  branch navigation, fork inheritance, model changes, live file edits, a missing
  selected file, malformed saved state, and failed persistence. Assert ordinary
  interactive/headless fallback diagnostics and retained selections, not only
  inspection artifacts.
- Inspection artifacts: claimed template and scope metadata match the actual
  prompt, including custom-core and fallback cases. Golden fixtures pin formats.
- Behavioral evaluation: a small, owner-reviewed set of casual, coding,
  troubleshooting, and approval-boundary tasks run through normal sessions.
  Reports name the model, settings, prompt digest, and observed failures.

Existing synthetic splice tests and artifact goldens remain regression coverage;
they do not replace the real-loader conformance test. Network evaluation is a
separate owner-approved activity, not a mandatory paid unit-test dependency.

## Slices

- [x] S1 Preserve instruction scope in Pi and show correctly tagged global and
  workspace instructions with both stock and custom cores. Demonstrate through
  real-loader fixtures and a recording provider; adapt editor boundary detection
  in the same slice so the new wrapper does not break the existing splice.
- [x] S2 Place scoped instruction blocks through templates while preserving
  each file once, unrelated extension additions, and fail-open behavior. Show
  early global placement and an old template that omits the new slots. (after S1)
- [x] S3 Make manual template selection session-local and persistent. Demonstrate
  two sessions, resume, fork, model switching, live edits, and missing files.
- [x] S4 Ship the authoring guide and starter/examples, consolidate owner policy,
  and extend inspection and output-test evidence for the new contract. Run the
  applicable extension and global-guidance gates. (after S2, S3)

## Open questions

- Owner review of this draft and its proposed verification seams precedes build.
- Select representative workspaces and model versions for the subsequent
  instruction audit. This does not block tooling; it blocks claims about a
  preferred cross-model layout.
- Confirm the supported Pi revision and local source checkout before S1. This
  change includes the Pi loader contract as well as the kit extension; changing
  installed generated JavaScript is not the implementation path.
