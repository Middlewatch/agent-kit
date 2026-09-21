# 0007: Edit pi's prompt sections in place; retire sysprompt-editor

Date: 2026-09-21
Status: accepted; supersedes 0002, 0004, 0005, and the core rebuild in 0006

## Context

Pi 0.86 builds its system prompt from named sections (`preamble`, `tools`,
`rules`, `docs`, `project_context`, `skills`, `cwd`), records them in the
transcript, and sends later changes as per-section patches. sysprompt-editor
replaced the whole prompt with a string rendered from owner templates and
proved its input against a mirror of pi's stock prose, which every reworded
pi release broke. A returned string now also opts out of section patches. The
choices were to re-pin the mirror, to rebuild the template layout from custom
sections under a custom prompt, or to keep pi's layout and change only the
sections the owner cares about.

## Decision

Keep pi's construction. `prompt-sections` replaces the `tools` and `rules`
bodies in place through `systemPromptOptions.sections`, starting from pi's own
rendering, and each extension that needs prompt text adds its own named
section. The kit still runs stock pi (0006); nothing rewrites the outgoing
request.

## Consequences

The mirror, the templates, the selection entry, and the provider capture are
gone; a pi release that rewords its prompt needs no change here. The preamble
and section order are pi's: a custom prompt removes the stock `tools`,
`rules`, and `docs`, so the first line stays stock. `/sysprompt` reads the
transcript's system messages, which is what pi sent, not what a provider
adapter did to it afterwards. A handler that runs after `prompt-sections` and
edits guideline inputs has no effect on `<rules>`.

## Considered options

- Custom prompt plus every section re-added as a custom one: owner preamble,
  but `<cwd>` moves to second place, later handlers' input edits are dropped,
  and a new stock section in a later pi could vanish unnoticed.
- `context_with_system` swapping the preamble per request: exact layout, but
  the transcript then differs from what the model saw.
