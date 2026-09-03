# Delegation standard

Project AGENTS.md files and skills that delegate import this by path. The
`agent-delegate` extension's `child-contract.md` is the enforced form of the
child half of this standard on Pi.

## Claim

Delegation is a context-economics instrument first and an independence
instrument second. Agents should not treat this as a throughput instrument.

The thing being bought is not speed. It is that a child's transcript is
discarded and only its conclusion survives. Delegation pays exactly when the
*output* of a task is large and its *conclusion* is small.

## Invariant

**The root stays accountable.** Delegation narrows what enters the root's
transcript, and it never transfers judgment. The root decides whether:
delegation repays its cost, writes the brief, owns shared writes and product
decisions, verifies material claims, and synthesizes the final answer. A
child's report is evidence to be weighed rather than a result to be pasted.

A corollary that matters in practice is that a child's claim of success is not
proof of success. Children have returned confident, wrong reports, so the root
re-runs the gate rather than trusting the summary.

## When delegation repays

Delegate when the task's output is bulky and its conclusion is compact:

- **Wide reads**: a repo-wide sweep, a corpus of docs, a long git history, a
  broad grep. The corpus enters the child and never the root.
- **Independent review**: a fresh context is the point rather than a side
  effect. The reviewer must not have watched the code being written.
- **Second derivation against an oracle**: per `freezable-workflow.md`, the
  highest-attribution bug finder in this estate.

Do the work yourself when:

- The read is a handful of known files. Briefing costs more turns than reading.
- The task depends on context the root has accumulated and the child cannot be
  given cheaply. A brief that has to reconstruct the session is not a brief.
- The work is a small edit inside a settled contract. Delegating a two-line fix
  spends a full agent's setup to save nothing.

## Shape

Uptake is not the problem. Shape is. Pushing agents to delegate more raises
whether they delegate but degrades how, so guidance constrains the brief and
the return, and does not cheerlead the act.

**A brief is complete and bounded.** It names the scope that the child may
touch, the pinned contract or acceptance that it works against, and the
question it is to answer. The brief tells the child what "done" means.
An open-ended "go look into X" is the wrong-shape failure in its most common
form.

**A return is a report, not a transcript.** It carries exact paths and line
ranges, evidence distinguished from inference, and commands or checks that the
child could not perform stated rather than silently skipped. It makes no
architecture or product decisions on the root's behalf and claims no success
that was not verified.

**Writer children are isolated mechanically.** A child may write.
`agent-delegate` puts every writable agent (seeded `editor`) in an
extension-created worktree on branch `delegate/<id>` and returns the branch
for the root to review, merge, and remove, so root and child never share a
tree. A single merger reconciles concurrent branches and re-runs the affected
gates. Writers cannot execute code, so the root re-runs the gate on the
merged tree before trusting the change.

**Depth one.** Children do not delegate. Nothing in this estate has needed a
deeper tree, and depth is where briefs decay into telephone.

**Concurrency is capped.** `agent-delegate` holds the current house cap
(three prose, twelve research, two writer children). Calls issued in one
assistant message run concurrently. A delegation issued and then waited on
individually is a sequential call wearing a parallel costume.

## Model and capability routing

Routing belongs to the extension rather than to the root's prompt.
`agent-delegate` owns every model slug in its versioned tier table (`scout`,
`analyst`, `judge`) and refuses to let the root name an arbitrary model, so
spend and capability policy stay in the trusted layer. The root may escalate
a child by tier and reasoning level when task complexity warrants it, and may
invoke named agent definitions (versioned role files: `explorer`, `critic`,
`researcher`, `refuter`, `editor`) but never define or modify one per call.
New delegation surfaces should keep these properties.
