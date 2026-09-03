# pi-interlock design basis

**Status:** as built 2026-08-15.

Read this document with
[`contracts/seatbelt-v2/operation.md`](contracts/seatbelt-v2/operation.md)
and its sibling contracts for the language-neutral behavior.

## Thesis

pi-interlock is a non-adversarial pre-execution seatbelt for Pi. It prevents a
small set of direct catastrophic mistakes without trying to confine arbitrary
programs or make ordinary supervised coding safer than the user's existing
Git and recovery practices.

Shield succeeds when it:

1. denies direct model-tool access to named credential stores and Interlock's
   private audit trail;
2. denies direct machine-level destructive operations;
3. asks before a recursive deletion crosses a defined filesystem boundary;
4. asks before a Git push updates `main` or `master`, force-pushes, mirrors, or
   pushes all branches; and
5. allows everything else, including unknown or ambiguous commands.

The product is usable only when ordinary surprise interruptions have median
zero per active day and a 95th percentile no greater than one. Expected
confirmations in explicit deletion, release, and maintenance workflows are
reported separately rather than hidden inside the ordinary-work metric.

## Threat model

The protected actor is a model that can make an ordinary mistake during a
supervised Pi session. The actor is not assumed to be malicious, deliberately
evasive, or able to compromise Pi itself.

The extension observes Pi's `tool_call` event before execution. A recognized
call is normalized into direct path accesses, recursive deletion targets, a
small catastrophic-operation shape, and a Git-push shape. The policy returns:

- **allow:** run the call;
- **ask:** show the exact call and reason through Pi's confirmation UI, then
  run only after confirmation; or
- **deny:** do not run the call.

Unknown tools, parse failures, wrappers, interpreter payloads, and behavior
hidden inside scripts default to allow. They may produce an audit observation,
but uncertainty is not itself a reason to interrupt the user.

This design does not resist prompt injection or intentional evasion. A model
can bypass shield through an unrecognized wrapper, arbitrary program, broad
ancestor search, or renamed executable. The documentation and UI must not
describe shield as a sandbox, adversarial boundary, or tamper-resistant gate.

## Modes

The runtime exposes exactly three modes:

1. **off:** do not evaluate or record;
2. **audit:** compute shield's verdict, record it as a shadow result, and
   always allow; and
3. **shield:** enforce the four seatbelt categories.

There is no enforce mode or full-command allowlist in this product. Reopening
that scope requires a new owner-approved design amendment and build plan.

Pi's footer displays the active mode. `/interlock` reports it, while
`/interlock off|audit|shield` atomically saves and activates a new mode for
subsequent tool calls. Mode changes are direct user commands rather than
model-callable tools. A failed save changes nothing.

An ask authorizes one tool call only. Cancel, timeout, print/JSON operation, or
another context without a responding confirmation channel denies that call.

## Shield policy

The first matching rule determines the verdict.

| order | category | verdict |
|---:|---|---|
| 1 | tool-input canonical path resolution failure | deny |
| 2 | direct access to a credential or private audit root | deny |
| 3 | direct machine-level catastrophe | deny |
| 4 | recursive deletion at or across a protected boundary | ask |
| 5 | push to `main`/`master`, force push, mirror, or all-branch push | ask |
| 6 | every other recognized or unknown operation | allow |

Stable rule IDs are:

- `credential.direct-access`;
- `credential.audit-access`;
- `path.resolution-failed`;
- `catastrophic.root-recursive`;
- `catastrophic.raw-device`;
- `catastrophic.filesystem-format`;
- `catastrophic.fork-bomb`;
- `delete.boundary`;
- `push.protected-branch`;
- `push.force-or-bulk`; and
- `default.allow`.

### Direct credential access

Credential protection binds to a direct access operation rather than a textual
mention. Documentation, heredoc text, program source, opaque strings, and a
broad search rooted above a protected store do not match this rule.

Built-in protected roots are:

- active Pi configuration: exact `auth.json`, trees `keys` and
  `var/interlock`;
- home trees: `.ssh`, `.gnupg`, `.aws`, `.azure`, `.kube`,
  `.config/gcloud`, and `.config/rpiv-web-tools`; and
- home exact paths: `.docker/config.json`, `.netrc`, `.pypirc`, and
  `.git-credentials`.

User configuration may append literal credential roots. There is no built-in
basename policy for `.env`, `*.key`, `*.pem`, fixture names, or other generic
secret-shaped files. A user may protect any such path explicitly.

Paths are canonical absolute paths. Existing symlinks resolve to their target,
and a missing leaf resolves through its nearest existing ancestor. A direct access
through an alias into a protected tree still denies. An unquoted direct glob
that can select a protected exact path, tree, or tree descendant under default
Bash segment matching also denies; a glob that can select only a broad ancestor
remains broad access. All access
semantics deny: read, create, edit, append, truncate, replace, move, delete, and
execute.

Only the exact known-tool fields, patch headers, shell verbs, options, and
redirects in
[`contracts/seatbelt-v2/operation.md`](contracts/seatbelt-v2/operation.md)
establish direct access. An unknown tool's strings do not establish access and
therefore default to allow. Shell support does not analyze arbitrary programs.

### Catastrophic machine operations

Shield denies only the direct forms frozen in the external operation contract:

- recursive deletion of `/` or a root-wide glob;
- executable basenames `mkfs`, `mkfs.*`, and `wipefs`;
- exact direct `dd` words of the form `of=/dev/NAME` frozen by the contract; and
- a direct fork-bomb form frozen in the conformance corpus.

This category stays deliberately small. Service changes, package operations,
database commands, infrastructure tools, extension installation, and ordinary
project cleanup are not categorical hazards.

### Recursive deletion boundaries

Deletion classification is semantic for recognized operations. It applies to
recursive `rm`, `find ... -delete`, and known tool delete operations rather
than one literal `rm -rf` spelling.

The effective authority root is the containing Git worktree root when one can
be discovered without mutation. Otherwise it is the operation's working
directory. The built-in estate roots are the kit's opinionated defaults,
defined in `src/config.ts`: `~/projects`, `~/vendor`, `~/work`, `~/research`,
`~/experiments`, `~/archive`, `~/wiki`, `~/journals`, `~/intake`, and `~/models`.
User configuration may append estate roots.

Recognized ephemeral roots are `/tmp`, `/var/tmp`, `~/.cache`, and the current
`PI_SCRATCHPAD` when present. User configuration may append ephemeral roots.
Deleting an ephemeral root itself asks, while deleting a descendant passes.

A recursive deletion asks when any target:

- equals home, an estate root, a repository root, or the authority root;
- is an ancestor of or lies outside the authority root, unless it is a strict
  descendant of an ephemeral root;
- is expressed through an unresolved variable, glob, or other target that
  cannot be proven contained; or
- is the root of a recursive known-tool delete with the same boundary shape.

The exact `rm`, `find -delete`, and known-tool grammars, root-glob token,
multiple-target precedence, eight-distinct-target repository-preflight budget,
and unsupported fallback are frozen in the external operation contract. A
target beyond the preflight budget is unresolved and therefore asks.

A literal descendant of the authority root passes. Examples include
`rm -rf build`, repository-local generated output, and ordinary scoped
cleanup. Non-recursive deletion is not a shield category unless it directly
touches a credential root.

### Consequential Git pushes

Shield asks for:

- an explicit destination of `main`, `master`, `refs/heads/main`, or
  `refs/heads/master`, including deletion refspecs;
- a bare/default push while the current branch resolves to `main` or
  `master`;
- `--force`, `-f`, or `--force-with-lease` on any branch; and
- `--mirror` or `--all`.

Ordinary feature-branch pushes pass. Read-only Git preflight may resolve the
current worktree, branch, and `@{push}` destination. State is cached and limited
to eight distinct working directories per tool call. A feature branch
configured to push to a protected destination asks. If state resolution fails,
explicit protected destination refspecs and flags still ask, and an otherwise
ambiguous push passes with an audit observation. Exact option and refspec
parsing is frozen in the external operation contract.

No other network, publishing, SSH, Git, or egress operation is a shield
category.

## Configuration

Configuration is one user-owned JSON file at the active Pi configuration root:
`interlock.json`. Project-local policy is not loaded.

The version-2 shape contains only:

```json
{
  "schemaVersion": 2,
  "mode": "off | audit | shield",
  "credentialPaths": [],
  "estateRoots": [],
  "ephemeralRoots": []
}
```

The arrays append canonical literal roots to the built-ins. Unknown keys or
invalid values invalidate the user layer, emit a value-free diagnostic, and
fall back to built-ins in audit mode. `PI_INTERLOCK_MODE` is an operator-owned
startup override.

The `/interlock off|audit|shield` command preserves valid configured roots,
atomically writes the selected global default, and then updates the live mode.
An invalid file or failed save leaves both live and persisted state unchanged.
A process override takes precedence again after reload or restart, which the
command reports. Exact command and persistence behavior is frozen in
[`contracts/seatbelt-v2/config.md`](contracts/seatbelt-v2/config.md).

There are no regular-expression command rules, project restrictions,
project-keyed allowances, trusted-host tables, protected-write surfaces, or
mode targets.

When no file exists, mode is audit. Invalid user files are discarded as a
complete layer with one value-free diagnostic. A valid process override is
applied after file handling; an invalid override emits one value-free
diagnostic and leaves the file/default mode unchanged. Exact parsing and
precedence are frozen in
[`contracts/seatbelt-v2/config.md`](contracts/seatbelt-v2/config.md).

## Audit

Audit computes shield's decision and always allows the tool call. It stores a
redacted NDJSON record under the active Pi state root. The directory is owner
only and is itself a direct zero-access root in shield.

Records retain timestamp, mode, tool, redacted operation shape, verdict, rule
ID, enforcement state, and a hash computed after redaction. Cwd, authority
root, Git root, credential roots, and every other path are replaced by category
tokens before hashing. Records never retain literal paths, file contents,
request bodies, header or environment values, branch/remote names, or raw tool
input. Audit write failure emits one fixed value-free diagnostic and does not
change a shield decision.

The audit sink is operational evidence rather than a security boundary. It does not
require descriptor-relative race hardening or protection against a malicious
same-user process.

## Deliberately out of scope

- enforce mode, default-deny execution, or a command allowlist;
- protection against prompt injection, malicious models, compromised Pi, or
  malicious extensions;
- full shell parsing or arbitrary-program analysis;
- generic network, upload, SSH, publishing, deployment, package, service,
  database, infrastructure, or Git-history policy;
- protecting Interlock's source, deployment symlink, user policy, agent
  settings, memory files, or other recoverable state from ordinary edits;
- generic secret-shaped filename matching;
- blocking broad searches whose roots contain protected descendants;
- Git checkout, restore, reset, clean, rebase, or other worktree controls;
- cross-harness adapters, durable approvals, or a model adjudicator; and
- publishing raw historical commands or session content.

## Verification and release

`scripts/verify.sh` is the single local gate. At acceptance it runs formatting,
type checking, unit tests, contract validation, bounded detector fuzzing, and a
standard-library Python harness that drives Pi's real pre-execution hook.

External JSONL fixtures freeze every allow, ask, and deny outcome. Every held
row proves the side effect did not occur. Ask rows prove yes, no, timeout, and
no-UI behavior. Paired mutations must make an ordinary allow and one seatbelt
hold fail before green is trusted.

The acceptance projection (2026-08-14) replayed 122,883 tool calls from 37
active days of Pi and Claude Code history through the production classifier
in shield mode: median 0 and p95 0 ordinary surprise interruptions against
limits of 0 and 1, no ordinary hard-denies, 457 expected owner-gated
confirmations (415 deletion-boundary asks, 42 push asks), and 7 hard denies
(6 path-resolution failures, 1 direct credential access).

Historical projection is local and aggregate-only. Raw history and sanitized
command rows are not committed. A deployment-readiness projection over the
available Pi and Claude Code history reports:

- ordinary surprise interruptions per active day;
- hard-deny counts and reasons;
- expected deletion and push confirmations separately;
- unresolved-variable and unknown-shape observations; and
- hypothetical no-UI holds when historical UI capability is unavailable.

Shield is eligible for live use only when ordinary surprise interruptions have
median zero and a 95th percentile no greater than one, with no ordinary hard
denial. The policy for any new deployment is to run in audit for at least
seven active days before the owner decides whether to enable shield.

The gate also runs an informational cost harness without pass/fail thresholds.
The accepted baseline on Node v22.23.1 measured:

- cold Node process plus TypeScript extension import: 542.296 ms median across
  seven runs, 489.250 ms above the empty-process median;
- production normalization plus shield decision for an ordinary repository
  read: 1,364.896 microseconds median and 1,612.059 microseconds p95 across 20
  batches of 25 calls; and
- redacted audit growth for that shape: 244,000 bytes for 500 records, or 488
  bytes per record.

These values are an operational snapshot rather than acceptance limits. Wall time
varies with machine load, process startup, filesystem cache, and Git latency.
The reproducible harness is `tests/measure-costs.ts`.

## Structure and provenance

The implementation is TypeScript loaded in Pi. Runtime seams are:

1. contracts, user configuration, and atomic mode persistence;
2. Pi mode command and footer integration;
3. canonical paths and known tool adapters;
4. a bounded shell detector for direct credential access, catastrophic forms,
   recursive deletion, and protected pushes;
5. a pure ordered policy evaluator;
6. Pi ask/block integration and redacted audit append; and
7. external conformance fixtures and the real-Pi runner.

Two earlier designs were retired by owner ruling on 2026-08-14 and are
superseded by this document: the v0 bash gate (a default-deny allowlist that
preceded this extension) and an adversarial enforce mode with full-command
allowlisting, whose bounded command classifier never reached a stable
security boundary. A scan of the owner's own session history found the real
losses were recoverable worktree mistakes plus one credential disclosure,
which set the product at catastrophe prevention with minimal interruption
rather than containment.

The complete language-neutral v2 contract is under
[`contracts/seatbelt-v2/`](contracts/seatbelt-v2/) and its 73-row oracle corpus
is under [`fixtures/seatbelt-v2/`](fixtures/seatbelt-v2/). The gate tests the
implementation against those assets. A policy change starts with the external
contract and fixture corpus rather than source interpretation.

Every publishable project file has exactly one concept-map owner. The ownership
test enforces these patterns and requires each pattern to remain documented
here.

| path pattern | concept owner |
|---|---|
| `.prettierignore` | deterministic formatting exclusions |
| `DESIGN.md` | current product doctrine, structure, and verification |
| `INTAKE.md` | dogfood complaint and resolution ledger |
| `README.md` | operator-facing project entry point |
| `contracts/seatbelt-v2/*.md` | language-neutral behavior contracts |
| `fixtures/.gitkeep` | fixture-directory topology |
| `fixtures/fuzz/*.json` | deterministic fuzz seeds |
| `fixtures/seatbelt-v2/*.json` | frozen fixture manifest |
| `fixtures/seatbelt-v2/*.jsonl` | frozen external behavior rows |
| `index.ts` | Pi lifecycle integration and public disposition |
| `package-lock.json` | reproducible dependency resolution |
| `package.json` | package metadata and gate commands |
| `scripts/*.sh` | single-command verification entry point |
| `src/*.ts` | runtime normalization, policy, configuration, and audit |
| `tests/*.py` | repository and real-Pi integration verification |
| `tests/*.ts` | unit, contract, fuzz, driver, and cost verification |
| `tsconfig.json` | strict TypeScript compilation contract |
