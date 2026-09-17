# Bounded delegate for Pi

`agent-delegate` adds one global Pi tool, `delegate`, for bounded depth-one
evidence gathering and mechanical writing. One delegation surface serves
code-evidence gathering, wide research fan-out, and reviewed mechanical
edits, with extension-owned model routing, rather than a general subagent
framework.

| profile | default tier | scope | child tools | return |
|---|---|---|---|---|
| `explore` (default) | scout | required | file inspection plus safe Git status/diff | prose, or an optional schema-validated object, capped at 24 KiB |
| `review` | analyst | required | file inspection plus safe Git status/diff | prose, or an optional schema-validated object, capped at 24 KiB |
| `research` | analyst | optional | `web_search` + `web_fetch`, plus the inspection tools when a scope is supplied | one JSON object validated against the caller's `resultSchema` |

## Model tiers

Every tier uses `openai-codex/gpt-6-astra`. `tiers.json` owns the model
slugs and default reasoning levels:

| tier | thinking | use case |
|---|---|---|
| `scout` | `low` | Bounded lookup, inventories, and mechanical extraction |
| `analyst` | `low` | General exploration, code review, research synthesis, and bounded editing |
| `judge` | `xhigh` | Difficult diagnosis, security review, and refutation of consequential claims |

Scout and analyst currently have the same route. Their names preserve existing
calls and describe task intent; choosing scout does not reduce model capability.
The owner selected Astra across all tiers to favor quality and token
efficiency. This is routing policy, not a benchmark result from this extension.

Choose the profile for its tools and return contract, then choose reasoning
for the difficulty of the question. The optional `thinking` parameter accepts
`low`, `medium`, `high`, and `xhigh` on any tier. Use `medium` for multi-step
tracing and `high` when several plausible explanations or cross-system
constraints need comparison. Select `judge` upfront when a missed defect or
weak inference could change a consequential decision. A large corpus alone
calls for a bounded search, not deeper reasoning.

A shallow answer can justify another call with a sharper brief and greater
reasoning depth. Missing evidence calls for better sources or scope; reasoning
cannot supply facts the child cannot inspect. The root owns final decisions
and verification even when a child supplies recommendations.

Tier precedence is call parameter, agent definition, then profile default.
Thinking precedence is call parameter, agent definition, then resolved tier
default. Both parameters fail closed outside their fixed vocabularies, and
callers cannot supply a model slug. A malformed tier table fails at load.

### Where the delegation standards live

| source | responsibility |
|---|---|
| This README, "When delegation repays" | When independent work is worth the coordination cost |
| `src/profile.ts` | Profile defaults, tools policy flags, and pool limits |
| `tiers.json` and `src/tiers.ts` | Model routes and accepted tier/thinking values |
| `agents/*.agent.md` and `src/agents.ts` | Named roles, defaults, and allowed capabilities |
| `index.ts` | Model-visible selection guidance, override precedence, and child CLI arguments |
| `child-contract.md` and `child-scope.ts` | Child instructions and enforced tool boundaries |

Workflow skills select work for this surface. The
[build skill](~/.agents/kit/skills/build/SKILL.md) requests a fresh review,
[deep review](~/.agents/kit/skills/deep-review/SKILL.md) uses judge-tier refuters,
and [Pi deep research](~/.agents/kit/skills/deep-research/SKILL.md) controls
research fan-out. These callers inherit the central routes rather than owning
model slugs. Claude Code's separate subagent routing is outside this tool.

## Agent definitions

`agents/<name>.agent.md` files are versioned role definitions the root
invokes by name (`agent` param, mutually exclusive with `profile`) but can
never define or modify per call. Frontmatter sets the base profile plus
optional tier, thinking, tools subset, writable flag, and turnCap; the
markdown body is a role prompt appended to the child contract under
`## Role`. Unknown keys, values, or tool names fail the whole load. `tools`
and `writable` have no per-call override. Seeds: `explorer` (explore/scout), `critic` (review),
`comment-sicko` (review, comment-audit lens),
`researcher` (research), `refuter` (research/judge), `editor` (review,
writable).

## Concurrency

Each pool is bounded: at most three active prose children (`explore` and
`review` share one pool), twelve active research children, and two active
writer children. The research pool is wider because a schema-validated
return is bounded by shape, so the parent's absorption bound holds by
arithmetic (12 × 24 KiB = 288 KiB, proven in `tests/absorption.test.ts`).

The extension supports POSIX hosts only; it refuses Windows because direct
child termination does not prove descendant process-tree cleanup there.

The accountable root decides whether delegation repays its cost, provides a
complete bounded brief, owns shared writes and product decisions, verifies
material claims, and synthesizes the final response. Calls in one assistant
message run concurrently within the pool bounds above. A delegation issued
and then waited on individually is a sequential call wearing a parallel
costume.

## When delegation repays

Delegation is a context-economics instrument first and an independence
instrument second, never a throughput instrument. What it buys is that the
child's transcript is discarded and only its conclusion survives, so it pays
exactly when a task's output is bulky and its conclusion is compact:

- **Wide reads**: a repo-wide sweep, a corpus of docs, a long git history, a
  broad grep. The corpus enters the child and never the root.
- **Independent review**: the fresh context is the point. The reviewer must
  not have watched the code being written.
- **Second derivation against an oracle**: re-deriving pinned behavior from
  its spec in a fresh context, then diffing.

Do the work in the root when the read is a handful of known files (briefing
costs more turns than reading), when the task depends on context the root has
accumulated and cannot hand over cheaply (a brief that reconstructs the
session is not a brief), or when the work is a small edit inside a settled
contract.

A child's claim of success is not proof of success. Children have returned
confident, wrong reports; the root re-runs the gate rather than trusting the
summary, and records the disposition with `assess_delegation`.

## Typed returns

`resultSchema` is required with `profile: "research"` and optional for
`explore` and `review`. Supplying it makes that child's final return typed,
and the profile's ordinary concurrency pool does not change.
Caller schemas stay within a documented keyword subset (`type`, `properties`,
`required`, `items`, `enum`, `const`, `minimum`, `maximum`, `minLength`,
`maxLength`, `minItems`, `maxItems`, `description`, `additionalProperties`)
and under 8 192 bytes serialized; anything off-list (`$ref`, `allOf`,
`oneOf`, `anyOf`, `not`, `patternProperties`, `format`, …) fails closed at
call time.

The child's raw return is capped at 24 KiB, sanitized, scanned, parsed as
exactly one bare JSON object, and validated against the schema. Validation
failures fail closed. No model-authored repair pass can add facts absent from
the child's evidence. The failure names the child and carries a rolling
transcript of up to 8 KiB. A validated object whose serialization exceeds 24
KiB is a typed failure (`oversize`). Injection-scan findings ride in the tool
result's `details.scanFindings` and the delegation record rather than the
JSON payload. The validated object remains the first text block. A separate final text block exposes the delegation UUID for
`assess_delegation`, with its fixed overhead reserved inside the complete 24
KiB model-visible result cap. Prose returns keep the
annotate-then-truncate disposition: a warning header naming the matched
pattern class and source, content delivered unmodified below it, truncated at
24 KiB.

## Web boundary (research children)

`web_search` walks the pinned provider chain Serper → Brave → Tavily,
skipping entries without keys, and reports the provider actually used per
call. Credentials are read from `~/.config/rpiv-web-tools/config.json`
(`apiKeys.serper` / `apiKeys.brave` / `apiKeys.tavily`), with no second
credential store. Queries are capped at 400 characters and results at 10.

`web_fetch` is bounded on five axes:

- http/https only
- at most 5 redirects
- a 30-second timeout
- at most 4 MiB read raw
- at most 64 KiB of extracted text delivered (script/style subtrees dropped,
  tags stripped, entities decoded)

The initial URL and every redirect hop are refused when the host is a literal
loopback, private, or link-local address or a `localhost`-style name. Host
names are not DNS-resolved, so a public name that resolves to a private
address is not caught. Therefore, point a research child only at trusted
targets (see `issues/2026-08-21-web-fetch-dns-rebinding.md`). Every fetched
text is sanitized (ANSI and invisible-unicode stripped) and scanned for
injection patterns, and findings are annotated onto the tool result.

## Child bounding

Every child carries three bounds:

- a one-hour wall-clock timeout
- a 30-turn backstop (past the cap, tool calls are blocked with a wrap-up
  directive, and a child that keeps talking is terminated by the parent at
  cap + 5 assistant messages)
- the 24 KiB return cap

Token consumption is metered and reported but never terminates a child.

A deterministic loop guard runs child-side on every profile. A tool-call
cycle of length ≤ 5 repeated 5 consecutive times halts the child, and an
identical call failing 3 times in a row draws one corrective nudge that
blocks the attempt. Re-issuing the call unchanged after the nudge halts. Halts surface to the root as typed failures naming
loop detection, with partial output attached.

## Delegation records

Every terminal child path writes one JSONL record to
`~/.local/state/agent-delegate/records/YYYY-MM-DD.jsonl` (named by the child's
UTC start date, pruned past 90 days at session start). Records carry:

- the globally unique id and label
- the brief verbatim
- profile, tier, resolved model and reasoning level, and resolved capability set
- token and wall-clock accounting
- validation outcome
- loop-halt and scan findings
- search providers used
- bounded provenance and unmatched citations
- the bounded successful return and its SHA-256 digest, or the failure
  cause with rolling partial output

Each successful result exposes its UUID in
a final model-visible text block. The root can pass that UUID to
`assess_delegation` with `used`, `corrected`, or `discarded` and a short
reason; that assessment appends to the same ledger without rewriting the
original record. Records never leave the machine.

## Evidence provenance

Every completed child tool call emits a bounded ledger entry containing the
tool, normalized target, success state, truncation state, response SHA-256, and
the file ranges or final URL actually returned. At most 64 entries and 64 KiB
of ledger data cross the child boundary, while the full ledger stays in the
local record rather than the normal root result. The parent compares URL and
`path:line[-line]` citations in the final answer with successful ledger
entries and exposes unsupported references as `details.unmatchedCitations`.
Set `requireMatchedCitations: true` to have the unmatched citations listed at
the top of the returned text as well, so they are in front of you when you
verify the report. The call completes either way.

A match proves only that the cited URL or `path:line` appeared in a
successful tool result the child obtained, which is weaker than the child
having independently inspected that exact location. Two limits follow. A
`path:line` string sitting inside file or page *content* the child read
counts as ledger support, so a match confirms the child saw the token rather
than that the location is real. And colon-number tokens in ordinary prose
(clock times, `RFC:2119`-style references) can read as file citations, so
the check can over-flag; treat the list as a verification queue rather than
a verdict. The
ledger is a cooperative hallucination catch rather than an anti-forgery
boundary (see `issues/2026-08-21-provenance-ledger-content-scrape.md`), and
the root still owns verification.

## Child authority (inspection)

Scoped children receive `inspect_read`, `inspect_grep`, `inspect_find`,
`inspect_ls`, `inspect_git_status`, and `inspect_git_diff`, implemented in the
child-side extension without a shell or downloadable helpers. The Git tools
use fixed argv and disable hooks, pagers, submodules, textconv, external diff
drivers, global/system config, and inherited Git control variables. They expose
status plus staged or unstaged diffs rather than arbitrary Git commands. Every
traversed file is checked, and symlinks, common metadata, and secret-bearing
paths are skipped. Children load no sessions, context files, skills, prompt
templates, global extensions, memory, shell, or `delegate` tool. Write tools
exist only for writer children, jailed to their own worktree. Research
children get the web tools instead of the inspection set (or beside it, when
a scope is delegated). An allowlist mechanically enforces the registered set.

`scope` must identify an existing directory beneath the home directory (or
beneath Pi's current working directory when Pi runs outside home), so
cross-lane scopes such as `~/.agents/journals` from a project cwd are legal.
Delegating the whole home directory or filesystem root is refused, and the
hidden top-level home trees and known credential-bearing paths are not eligible
child scopes.

`scopes` accepts up to four directories under the same rules, for tasks whose
evidence spans lanes (a repo plus its journal, a project plus a reference
checkout). The child resolves relative paths against the first scope and
addresses the others with absolute paths; an absolute path outside every
delegated scope is refused. `scope` and `scopes` are mutually exclusive.

## Bounded writers

A writable agent definition (seeded: `editor`) is the only path to writes,
and a writer never touches the delegated repo directly. The extension
creates a git worktree on branch `delegate/<id>` under
`~/.local/state/agent-delegate/worktrees/<id>`, branched from the first
scope's repository HEAD, and the worktree replaces that scope as the child's
working root; later scopes stay read-only. The child gets `write_file` and
`edit_file` jailed by the same path policy as reads plus symlink and
hardlink sweeps, and a fixed-argv `git_commit` with hooks and signing
disabled. Writers have no shell and no execution, so they cannot run tests.
The brief should say what the root will verify after the merge.

Every terminal path summarizes the branch (commit list, diffstat, dirty
state) into the tool result, details, and the durable record. A worktree
with commits or uncommitted changes survives for the root to review, merge,
and remove (the result includes the exact removal command). An untouched
worktree is removed with its branch automatically.

Two caveats. Git clean/smudge filters defined by the delegated
repository's own config and attributes still run during worktree creation
and `git add`, so a repo that configures filters can execute code through
them. The standing rule against delegating into hostile trees covers
writers doubly. And a session shutdown that lands mid-writer leaves the
worktree in place with a record that may lack the branch summary;
`git worktree list` in the source repo names any leftovers.

There is no `verify` profile. General shell is write/process/network
authority, and no tested child sandbox exists to contain it. Wiki and journal
reads need no dedicated profile, because `~/.agents/wiki` and
`~/.agents/journals` are ordinary read-only scopes.

## UI and lifecycle

Tool rows stream child status, current tool, model, turns, and token usage. A
compact widget shows active children per pool, and `/delegations` shows
active/recent records. Escape and normal Pi shutdown await TERM-to-KILL child
process-group cleanup.

Only compact tool-result details are kept in the normal Pi session: the
provenance ledger collapses to a count plus `reads`, the child's
`inspect_read` targets and outcomes (at most 64, joined to the first scope
root so they name files rather than scope-relative paths), which
autojournal records as the turn's child consultation. Raw child
streaming events are parsed in memory and discarded rather than creating the
hundreds of megabytes of duplicate partial-event traces observed in the
experiment.

The inspection layer is a path jail rather than an OS sandbox. The inspection implementation opens authorized
regular files with no-follow semantics and rejects symlink components, but it
cannot provide kernel-level protection against a malicious concurrent process
replacing directory entries between checks. Do not delegate into an actively
hostile or concurrently mutated tree.

## Layout

Two entry points sit at top level. `index.ts` is the parent-side extension pi
loads globally. `child-scope.ts` is the child-side extension every child
process loads with `--no-extensions`. It registers the child tool set and
enforces the turn cap and loop guard child-side. `child-contract.md` is read
at runtime as the child's replacement system prompt. `src/` holds the shared
library modules, each with a test file under `tests/`. `agents/` holds the
versioned agent definitions, and `tiers.json` owns the model routing table.

## Deployment

This directory loads through
the kit's pi package (`package.json` lists `./extensions/agent-delegate/index.ts`);
`bin/install` at the kit root registers the package.

No separate skill is installed, because the tool's description and active
prompt guideline contain the small amount of model guidance required, and a
global skill would duplicate always-visible surface without adding a
capability.

After changing routing or tool parameters, use `/reload` or start a new Pi
session. The running extension holds its loaded tier table. The child runtime
must have the configured model in its catalog and support its reasoning levels;
`pi --list-models gpt-6-astra` checks catalog availability. The extension does
not validate provider capabilities or confirm the provider's effective effort.

## Verification

```bash
npm test
# opt-in paid comparison using the analyst route for both roots; not part of npm test:
AGENT_DELEGATE_RUN_LIVE_EVAL=1 npm run eval:live
# prose child:
pi --no-extensions -e ./index.ts --no-session --model openai-codex/gpt-6-astra \
  --thinking low --tools delegate -p \
  'Use delegate with profile explore, scope src, for one bounded inspection.'
# typed research child:
pi --no-extensions -e ./index.ts --no-session --model openai-codex/gpt-6-astra \
  --thinking low --tools delegate -p \
  'Use delegate with profile research and a resultSchema requiring {finding, sourceUrl} to answer: what is the current stable Node.js LTS major version?'
```
