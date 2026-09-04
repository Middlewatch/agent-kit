# 0005: Observe provider payloads after all transforms

Date: 2026-09-04
Status: accepted

## Context

An inspection extension attached to `before_provider_request` can capture stale
text when a later handler replaces the payload. Registering inspection last makes
correctness depend on extension load order.

## Decision

Pi emits `provider_request` after all payload transforms. Each observer receives
an isolated snapshot and the request-time model identity. Observer mutations and
return values cannot change transport or another observer's snapshot.

## Consequences

The editor requires the companion Pi patch for authoritative capture. Output tests
use request-time model labels and link their final provider capture. Unaccounted
core edits are checked separately against `before_agent_start.originalSystemPrompt`.
