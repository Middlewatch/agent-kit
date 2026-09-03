---
name: diagnose
description: "Disciplined diagnosis loop for hard bugs and performance regressions: build a feedback loop that goes red on this exact bug, minimise, rank falsifiable hypotheses, probe one variable at a time, fix behind a regression test. Use when something is broken, throwing, failing intermittently, or slow, and the cause is not already obvious. An obvious cause skips this and gets fixed directly."
---

# Diagnose

The skill is Phase 1. If you hold a tight pass/fail signal that goes red on this bug,
bisection, hypothesis testing, and instrumentation all just consume it and the bug is
mostly dead. Without one, reading code to build a theory is the exact failure this skill
exists to prevent.

Before starting: read `CONTEXT.md` and the ADRs for the area if they exist, and redact
secrets from anything you show. Credentials stay in env vars, not in quoted output.

## Phase 1: build a feedback loop

One command that drives the real bug path and asserts the user's exact
symptom. Ways to construct it:

1. **Failing test** at whatever seam reaches the bug.
2. **CLI invocation on a fixture**, diffing stdout against a known-good
   snapshot.
3. **Replay a captured artifact** (session file, wire frames, event log)
   through the code path in isolation.
4. **Differential run**: same input through the oracle or the second
   implementation, diff the outputs.
5. **Throwaway harness**: one service or module booted with mocked deps,
   exercising the path with a single call.
6. **pexpect / pty script** for TUI behavior; assert on the frame, not
   "didn't crash".
7. **Bisection harness**: if the bug appeared between two known states,
   automate "boot at X, check" so `git bisect run` can eat it.
8. **Stress loop** for flaky bugs: `-race -count=100`, parallel runs,
   injected sleeps. The goal is a reproduction rate high enough to debug,
   not a perfect repro.

Then tighten it: faster (skip unrelated init, narrow the scope), sharper (assert the
specific symptom), more deterministic (seed RNG, pin time, isolate the filesystem).

**Completion criterion:** you can name one command, you have already run it at least once
and shown the output, and it is red-capable (catches this specific bug), deterministic (or
high-rate for flakes), fast, and runnable unattended. Without this command don't proceed
to Phase 2. If you genuinely cannot build one, stop, list what you tried, and ask the
owner for a captured artifact, an environment, or permission to seek/install a different
instrument.

## Phase 2: reproduce and minimise

Run the loop, watch it go red on the symptom the user described (a nearby different
failure is the wrong bug). Then shrink: cut inputs, callers, config, and steps one at a
time, re-running after each cut, until every remaining element is load-bearing. The
minimal repro shrinks the hypothesis space and becomes the regression test.

## Phase 3: hypothesise

Write 3 to 5 ranked hypotheses before testing any. Each must be falsifiable: "if X is the
cause, changing Y makes the bug disappear." A hypothesis with no prediction is a vibe;
sharpen or discard it. Show the ranked list to the owner before probing (they often
re-rank it instantly), but proceed with your ranking if they are away.

## Phase 4: probe

Each probe maps to one prediction; change one variable at a time. Prefer a debugger or
REPL breakpoint, then targeted logs at the boundaries that distinguish hypotheses. Never
log-everything-and-grep. Tag every debug line with one prefix (`[DBG-4f2a]`) so cleanup is
a single grep. For performance regressions, skip logs: measure a baseline, then bisect;
measure first, fix second.

## Phase 5: fix behind a regression test

Write the regression test before the fix, at a seam that exercises the real bug pattern as
it occurred. If the only reachable seam is too shallow to replicate the triggering chain,
that absence is itself a finding; note it rather than writing a false-confidence test.
Then: watch it fail, apply the fix, watch it pass, and re-run the Phase 1 loop against the
original un-minimised scenario.

## Phase 6: cleanup

Done means: original repro is green, regression test is in the suite (or the missing-seam
finding is recorded), every `[DBG-` line is gone by grep, throwaway harnesses are deleted
or parked in the scratchpad, and the commit message states the hypothesis that turned out
true so the next debugger learns something. If the finding was genuinely surprising, it is
a `harvest` candidate.
