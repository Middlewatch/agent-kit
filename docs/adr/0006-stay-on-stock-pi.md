# 0006: Stay on stock Pi and rebuild the core from its inputs

Date: 2026-09-05
Status: accepted; supersedes the patch requirement in 0005

## Context

The scoped-template build carried a companion Pi source patch: loader scope on
`contextFiles`, `originalSystemPrompt` on `before_agent_start`, a post-transform
`provider_request` event, and immediate custom-entry persistence. Each closed a
real gap, but a patched runtime has to be rebased, rebuilt, and reinstalled on
every Pi release, and a routine `npm install` reverts it. The installed Pi moved
to 0.85.1 while the patch targeted 0.85.0, and the extension sat inert behind a
fail-open warning.

## Decision

The extension depends only on the published package. Stock Pi's
`before_agent_start` carries the inputs the core was built from, so the
extension mirrors the pinned release's core builder and accepts a core only when
it equals that reconstruction; that supplies provenance without a patch. Scope
comes from where the loader found each file (agent directory is global, any
other directory is workspace). Capture uses `before_provider_request` with the
session's model at request time. The persistence fix is dropped and its
behavior documented.

## Consequences

A Pi release that changes the core prose fails the mirror suite and the runtime
fails open until the mirror is re-pinned alongside the `package.json` bump; that
is the maintenance the patch cost, moved into one file and one test. Inspection
labels a custom core `custom` without its file path. A switch before the first
reply lives in memory until Pi writes the session file; a failed switch write is
reported as memory-only. Capture sees the payload at this extension's position
in load order. The retired patch stays in `extensions/sysprompt-editor/patches/`
as the record of the loader-side contract, and upstreaming it remains open.
