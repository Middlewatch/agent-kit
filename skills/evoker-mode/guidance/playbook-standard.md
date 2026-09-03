# Playbook standard

Skills that route work import this by path. The pattern is adapted from
pstack's `poteto-mode` (github.com/cursor/plugins, MIT).

## Claim

A skill that both routes and executes drifts: the agent reads it, writes a
bespoke plan, and drops named steps along the way. Splitting the two fixes
this. A **router** matches the task to a task shape. A **playbook** is the
step list for one shape, and it enters the todo list verbatim, so a dropped
step is visible instead of silent.

A playbook is not a skill. It has no frontmatter, is not independently
invocable, and is only reached through its router. Leaf skills (diagnose,
prototype, adr) stay skills; playbook steps name them at the point they fire.

## The router contract

A router skill that adopts this standard does four things, in order, before
any task-specific reasoning:

1. **Match** the task to one playbook. When two fit, the narrower wins. When
   none fits, say so and proceed without one; do not force a match.
2. **Copy the matched playbook's numbered steps verbatim** as the first todo
   items, ahead of any task-specific todos.
3. **Mark every step it will not run** with `skip: <one-line reason>` in the
   todo list. The step stays visible.
4. **Route** to the leaf skills a step names when that step fires, reading
   the skill at that point rather than up front.

The verbatim copy is the enforcement mechanism. Paraphrased steps are where
steps disappear.

## The playbook file

One file per task shape, in a `playbooks/` directory beside the router's
`SKILL.md`. Format (template: `playbooks/TEMPLATE.md`):

- **Title**, an `###` heading naming the shape.
- **Ownership line**, bold: "You own <the one thing this playbook
  guarantees>," followed by the trigger phrases that select it and any
  neighbor it is commonly confused with.
- **Numbered steps.** Each step is an action the agent can put in a todo
  list as written. A step that invokes a leaf skill names it.
- **Reply**, bold: what the final reply to the owner must contain.

## Sizing

A playbook stays near 20 lines and never exceeds 40. Rationale, evidence,
and long procedures move to the leaf skill or a reference the step points
at. A playbook that keeps growing is two shapes; split it.

## Verification

A playbook is verified the same way a skill is: use it on real work. After
a run, a step that was skipped with the same reason twice is either deleted
or rewritten so it fires.
