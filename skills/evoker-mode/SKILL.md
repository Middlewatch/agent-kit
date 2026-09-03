---
name: evoker-mode
description: "Route every task through the matching playbook and ground decisions in the principle files. Owner-invoked: /evoker-mode activates the router for the rest of the session."
disable-model-invocation: true
---

# Evoker Mode

A full router across many different workflow paradigms. Match the task to a playbook, copy
its steps verbatim into the todo list, ground the choices in principles, and cite only the
principles that changed a decision. The router contract and playbook format are
`guidance/playbook-standard.md`.

## Non-negotiables

**Ground every multi-step task in the Principles index below; the matched playbook's steps
go first in the todo list, per the playbook standard. After copying them, append one todo
item, `Read principle files: <the ones this task triggers>`, and read each file in full
before the step it informs.** In your reply, cite each principle that changed a decision
by the specific rule from its file, and say what it changed.

Remaining triggers:

- About to make a nontrivial change or an architecture decision mid-task → read and
  follow the walkthrough procedure at `~/.agents/kit/prompts/how.md` first. A standalone
  question ("how does X work", "are we sure?") routes to the Investigation playbook
  instead.
- About to `ask_user_question` on a "which approach" or "what should this do" fork →
  classify it first. If the answer is a fact you could observe by running something
  (behavior, timing, layout, output, perf), sketch it via the Prototype playbook and let
  the result decide. Reserve the question for a genuine preference or product call no
  experiment can settle.
- New state, a growing conditional chain, or a shape assumption about to repeat → name the
  data shape and choose its organizing structure per `principles/model-the-domain.md`.
- Something broken with a non-obvious cause → the `diagnose` skill, usually inside the Bug
  fix playbook.
- New behavior or build that will take longer than a session or two → the `spec` skill,
  then `build`. Feature work routes here and there are no playbooks to follow. Apply the
  correct principles to match the task as you understand it.
- Planning whose open decisions will not converge in one grilling conversation, or a
  `spec` session that stopped on open forks → the Long-horizon planning playbook.
- A change to the existing system, project, module, or codebase that does not require a
  behavior change → the refactoring playbook.
- A request for an optimization pass or a performance sweep (The user wants something to
  run faster or work better) → the Hillclimb playbook.
- The user needs you to investigate and identify a root cause for a system performance
  issue, a slow down, a freeze, a crash or some other hardware related issue → the Trace
  Forensics playbook. The analysis could be directly related to prior work or an unrelated
  system problem.
- Contested design or a risky diff before it ships → the Interrogate playbook. A bounded
  independent audit with a findings artifact → the `deep-review` skill.
- Research whose answer should persist → the `deep-research` skill.
- Any prose surface → the prose standard
  (`~/.agents/kit/skills/slopfix/references/prose-standard.md`). Your reply is a prose
  surface. Skills and playbooks also follow `AUTHORING.md` and the playbook standard.
- A decision that is hard to reverse, would surprise a later reader, and had real
  alternatives → the `adr` skill at the moment it settles.
- A genuinely surprising coding result → the `harvest` skill, in flight.
- Long, autonomous, or multi-session work the owner reviews after the fact → a decision
  trail per `guidance/trail-standard.md`. A spec'd build already has its record (commit
  log plus slice checklist) and opens one only when the owner asks.
- Broken skill or tool mid-task → fix it in its own commit. Don't block, and don't
  silently work around it.
- Resume, continue, pick up from the last session → The session pickup playbook.

## Principles

Each entry names when it applies; the file holds the full rules. Files live in
`principles/`.

**Core**

- **Laziness Protocol** (`laziness-protocol.md`). Refactoring, sizing a diff, or tempted to add abstractions or layers. Bias to deletion and the smallest change that solves the problem.
- **Foundational Thinking** (`foundational-thinking.md`). Before writing logic: core types and data structures, scaffold-vs-feature sequencing, what concurrent actors share.
- **Redesign from First Principles** (`redesign-from-first-principles.md`). Integrating a new requirement into an existing design. Redesign as if it had been foundational from day one.
- **Subtract Before You Add** (`subtract-before-you-add.md`). Sequencing an addition, refactor, or rewrite. Remove dead weight first, then build on the simpler base.
- **Minimize Reader Load** (`minimize-reader-load.md`). Reviewing or shaping code that's hard to trace. Count layers and hidden state, collapse one-caller wrappers, shrink mutable scope.
- **Outcome-Oriented Execution** (`outcome-oriented-execution.md`). Planned rewrites and migrations with phase boundaries. Converge on the target architecture without throwaway compatibility states.
- **Experience First** (`experience-first.md`). Product, UX, or feature-scope tradeoffs. Choose user delight over implementation convenience.
- **Exhaust the Design Space** (`exhaust-the-design-space.md`). A novel decision with no precedent. Build 2-3 competing prototypes and compare before committing.
- **Build the Lever** (`build-the-lever.md`). Any non-trivial mechanical work. Build the tool that does or proves it; the tool is the artifact a reviewer reruns.

**Architecture**

- **Model the Domain** (`model-the-domain.md`). Stateful logic, heavy branching, or a shape assumption repeated across files. Encode the domain in a structure instead of scattered conditionals.
- **Boundary Discipline** (`boundary-discipline.md`). Wiring validation, error handling, or adapters. Guards at system boundaries, trust internal types, keep business logic pure.
- **Type System Discipline** (`type-system-discipline.md`). Designing types or a signature in any typed language. Make illegal states unrepresentable, parse external data at boundaries.
- **Make Operations Idempotent** (`make-operations-idempotent.md`). Commands, lifecycle steps, or loops that run amid crashes and retries. Converge to the same end state.
- **Migrate Callers Then Delete Legacy APIs** (`migrate-callers-then-delete-legacy-apis.md`). A new internal API while old callers exist. Migrate and delete in one wave.
- **Separate Before Serializing Shared State** (`separate-before-serializing-shared-state.md`). Concurrent actors might write the same file, branch, or key. Eliminate the sharing first.

**Verification**

- **Prove It Works** (`prove-it-works.md`). After a task, before declaring done. Verify against the real artifact, not a proxy or "it compiles".
- **Fix Root Causes** (`fix-root-causes.md`). Debugging. Reproduce first, trace each symptom to its root cause, ask why until you reach it.
- **Sequence Work into Verifiable Units** (`sequence-verifiable-units.md`). Sweeps, migrations, runs of similar edits. Small units that each end in a check, ordered so the sequence proves itself.

**Delegation and meta**

- **Guard the Context Window** (`guard-the-context-window.md`). Large outputs, long files, repeated reads, fan-out planning. Route bulk to delegate children or scratchpad scripts, keep summaries in the main thread.
- **Encode Lessons in Structure** (`encode-lessons-in-structure.md`). Writing the same instruction a second time. Encode it as a lint, check, or script instead of more text.

## Autonomy

Reversible work proceeds without asking. Destructive or hard-to-reverse operations and
outward-facing actions wait for the owner, per the global guide. Session overrides ("run
until done", "going to bed") mean keep going within those gates, with a trail.

**No is an acceptable answer.** Asked whether to do something, invited to add scope, or
shown an approach, reply with your real judgment. Decline, push back, or say "this doesn't
earn its place" when true. A recommendation is a judgment, not a validation.

## Delegation

The surface is the `agent-delegate` tool: depth-one, read-only children on the `explore`,
`review`, and `research` profiles, three concurrent prose children and twelve research
children, extension-owned model routes. The doctrine is
`~/.agents/kit/guidance/workflows/delegation-standard.md`: children gather, the root
judges. A complete bounded brief names the scope, the question, and what done means. You
own every child's work: verify material claims against the source before repeating them,
and record dispositions with `assess_delegation`. A second opinion is the same brief on
the `review` profile.

## Writing the reply and comments

Write it clean as you draft it. The prose standard governs. Frame impact for the consumer
and the maintainer before implementation detail. Never fabricate a link, citation, or
number.

Comments follow the same rule: no phase narration, no restating the code. Keep a comment
only for something non obvious the code doesn't already show show. This applies to every
file you produce, including test scripts.

## Playbooks

Per `guidance/playbook-standard.md`: match one playbook (narrower wins), copy its numbered
steps verbatim as the first todo items, mark any step you will not run with `skip:
<reason>`, and route to leaf skills when their step fires. When none fits, say so and
proceed without one.

- **Investigation.** Read-only question: how does X work, why was Y built this way, are we sure about Z. `playbooks/investigation.md`.
- **Bug fix.** A reported defect to reproduce, root-cause, and fix with runtime evidence. `playbooks/bug-fix.md`.
- **Hillclimb.** Sustained improvement of one metric against a target: hypothesis loop, before/after measurement, decision trail, keep-or-revert. `playbooks/hillclimb.md`.
- **Trace forensics.** Diagnose a captured artifact (profile, trace, heap snapshot, core). Deliverable is a diagnosis, not a fix. `playbooks/trace-forensics.md`.
- **Refactoring.** Behavior-preserving change to structure: rename, extract, inline, dedupe, move. `playbooks/refactoring.md`.
- **Prototype.** A throwaway sketch to settle a design or empirical fork by observing instead of asking. `playbooks/prototype.md`.
- **Interrogate.** Multi-perspective adversarial review of a contested design or risky diff, on review children. `playbooks/interrogate.md`.
- **Authoring a skill.** Writing or editing a SKILL.md or playbook. `playbooks/authoring-a-skill.md`.
- **Long-horizon planning.** A decision map (`docs/plans/<slug>.md`) for an effort too foggy for one spec conversation; one question per session, feeding `spec`. `playbooks/long-horizon-planning.md`.
- **Session pickup.** Resuming or taking over a prior agent's in-flight work. `playbooks/session-pickup.md`.
- **Pause safely.** Suspending in-flight work cleanly so it can be resumed. `playbooks/pause-safely.md`.
