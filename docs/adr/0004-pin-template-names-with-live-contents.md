# 0004: Pin template names per session and keep contents live

Date: 2026-09-04
Status: accepted

## Context

A shared active-template pointer makes one session's switch change other sessions.
Snapshotting template text would isolate them but would also prevent live edits
from reaching sessions already using that template.

## Decision

Persist the filename in a branch-local Pi custom entry and reread its contents on
each turn. The shared pointer supplies only the initial default.

## Consequences

Resume and fork use Pi's branch history. Model changes leave selection alone.
Missing files preserve the pin and fail open. Historical bytes require an explicit
provider capture; the selection entry cannot reconstruct an earlier edited prompt.
