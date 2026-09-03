# Seatbelt v2 operation contract

## Normalized shape

Every recognized tool call produces one operation with tool name, cwd,
authority root, ordered direct path accesses, ordered recursive delete shapes,
ordered catastrophe IDs, ordered push shapes, and ordered observations.
Unrecognized content leaves those enforcing arrays empty.

An operation is never described as safe. Unsupported or malformed forms add
`unsupported:<family>` when the detector can identify a family without
claiming its operands. Policy still defaults allow.

## Known tool mappings

Tool names are exact and case-sensitive.

| tool | accepted fields | access |
|---|---|---|
| `read` | exactly one string `path` or `file_path` | read |
| `write` | exactly one string `path` or `file_path` | replace |
| `edit` | exactly one string `path` or `file_path` | edit |
| `grep` | optional string `path`, otherwise cwd | read |
| `find` | optional string `path`, otherwise cwd | read |
| `ls` | optional string `path`, otherwise cwd | read |
| `delete` | string `path`; optional boolean `recursive` defaults false | delete; recursive shape only when true |
| `apply_patch` | one string `patch` in the frozen patch subset below | per patch header |
| `bash` | exactly one string `command` | bounded shell detector |
| `exec` | exactly one string `command` | bounded shell detector |
| `exec_command` | exactly one string `cmd` | bounded shell detector |

Extra fields are ignored. Missing, duplicate-alternative, or wrong-typed
accepted fields make the tool unsupported and produce no path guess. Every
other tool name is unknown and produces no direct access even when its strings
contain protected paths.

The patch subset accepts line-leading `*** Add File:`, `*** Update File:`,
`*** Delete File:`, and `*** Move to:` headers. Add is create, update is edit,
delete is delete, and move is move on the update source plus replace on the
destination. A malformed header sequence makes the complete patch unsupported;
no partial paths are emitted.

## Bounded shell surface

The detector handles unquoted/quoted words, backslash escapes, top-level `;`,
newline, `&&`, and `||`, plus `<`, `>`, `>>`, and `<>` redirects.
Backslash-newline is removed in unquoted and double-quoted text, matching Bash
line continuation. A literal
`cd DIR` segment with one path word updates cwd for following top-level
segments. Pipelines, command/process substitution, heredocs, wrappers,
interpreter program text, functions, loops, and other grammar make the affected
segment unsupported. Other independent top-level segments remain eligible. A
syntactically complete redirect is classified independently even when the
executable's operand/options are unsupported; unsupported command operands are
not guessed.

Executable identity is the basename of the first word. A first word that is an
absolute or relative path also emits execute access to that word.

Supported direct path verbs are deliberately exact:

| access | executable | accepted operand rule |
|---|---|---|
| read | `cat`, `head`, `tail`, `less`, `more`, `wc`, `file`, `stat`, `jq` | words after optional exact `--`; any other option makes segment unsupported |
| read | `grep`, `rg` | last word after optional exact `--`; any option before `--` makes segment unsupported |
| read | `ls` | words after optional exact `--`; any other option makes segment unsupported |
| read | `find` | leading roots defined under deletion; roots are also read |
| read | `cmp`, `diff` | exactly two words after optional exact `--` |
| read/replace | `cp` | exactly source then destination after optional exact `--` |
| move/replace | `mv` | exactly source then destination after optional exact `--` |
| delete | `rm` | target words under the rm grammar below |
| create | `mkdir`, `touch` | words after optional exact `--`; any other option unsupported |
| edit | `chmod`, `chown` | mode/owner word then path words after optional exact `--`; any option unsupported |

Redirects emit read for `<`, truncate for `>`, append for `>>`, and edit for
`<>`. Descriptor duplication, `/dev/null`, and unsupported redirect grammar do
not emit filesystem paths. Quoted text remains a word; an `echo` operand never
establishes access.

Path-like operands resolve from segment cwd. A direct operand need not exist.
An unquoted pathname-glob character (`*`, `?`, or `[`) remains attached to a
direct operand, executable path, or redirect after normalization. Shield
compares the canonical pattern segment by segment with every protected exact
path and tree. A pattern that can directly select a protected exact path, tree,
or tree descendant is credential access and denies. Matching follows default
Bash segment rules for `*`, `?`, and character classes: a wildcard does not
select a leading dot unless the pattern segment begins with a literal dot. A
pattern with fewer path segments that can select only a broad ancestor remains
ordinary broad access.

## Recursive deletion

Recognized recursive rm is executable `rm` with `-r`, `-R`, `--recursive`, or
a short-option cluster containing `r` or `R`. Supported other options are `-f`,
`-i`, `-I`, `-v`, and `--force`; `--` ends options. An unknown option makes the
segment unsupported. Every remaining word is a target. A target containing an
unquoted glob character `*`, `?`, or `[` or an unresolved `$` expansion is an
unresolved target and is not expanded by Interlock.

Recognized find deletion is executable `find`, zero or more leading root words,
then an expression containing exact `-delete`. With no leading root, root is
`.`. An unknown leading option before a root makes the segment unsupported.
Roots are recursive deletion targets.

Known tool `delete` with `recursive: true` produces one recursive target.

Each canonical literal target is evaluated as follows:

1. Exact `/` or unresolved exact token `/*` is
   `catastrophic.root-recursive` deny.
2. Exact home, estate root, authority root, ephemeral root, or arbitrary Git
   repository root is `delete.boundary` ask.
3. An ancestor of or target outside authority root asks, except a strict
   descendant of an ephemeral root allows.
4. An unresolved target asks.
5. A strict literal descendant of authority root allows.

An arbitrary existing target is a repository root only when read-only
`git -C TARGET rev-parse --show-toplevel` succeeds and its canonical output
equals canonical TARGET. Missing targets are not repository roots. Repository
preflight is limited to eight distinct literal targets per tool call; duplicate
targets reuse the first result and every target beyond the budget becomes
unresolved. Multiple targets preserve input order. Policy scans every shape for
catastrophic root deletion before evaluating any ask, so the most restrictive
result wins.

Nonrecursive `rm` never creates a deletion-boundary shape, but its direct path
access can still hit credential policy.

## Catastrophe grammar

Only these direct top-level forms are catastrophic:

- recursive rm target `/` or exact unquoted `/*`;
- executable basename `mkfs` or prefix `mkfs.` with any arguments;
- executable basename `wipefs` with any arguments;
- executable basename `dd` with an exact word `of=/dev/NAME` where NAME is
  nonempty and not `null`, `zero`, `random`, `urandom`, `stdin`, `stdout`,
  `stderr`, or `fd/*`; and
- the exact token sequence `:(){ :|:& };:` after whitespace normalization.

Other destructive-looking strings and unsupported option forms default allow.

## Git push grammar

Recognized form is `git` followed by zero or more exact `-C DIR` pairs, then
exact subcommand `push`. Any other global option makes the segment unsupported.
Push options may appear before operands:

- ask flags: `-f`, `--force`, `--force-with-lease`, any
  `--force-with-lease=VALUE`, `--mirror`, and `--all`;
- supported no-value flags: `-u`, `--set-upstream`, `--dry-run`, `--atomic`,
  `--porcelain`, `--quiet`, `--verbose`, `--follow-tags`, `--tags`, `--prune`,
  `--delete`, and `--no-verify`; and
- supported value forms: `--repo VALUE`, `--receive-pack VALUE`, `--exec VALUE`
  and their `--name=VALUE` spellings.

Any other option makes push unsupported unless an ask flag already establishes
`push.force-or-bulk`; in that case the ask survives and operands remain
unresolved.

The first operand is remote and remaining operands are refspecs. With no
operand, remote is unresolved. A refspec is `[+]<source>[:<destination>]`.
Leading `+` establishes force. A destination is protected when, after removing
one `refs/heads/` prefix, it is `main` or `master`. With no colon, source name
also names destination except `HEAD`, which requires preflight. Empty source
deletes destination.

Normalized push shape includes remote, source refspecs, explicit destination
refs, resolved default destination refs, force, bulk, current branch,
state-resolved boolean, and observations.

Read-only preflight runs in effective `-C` cwd and may resolve:

1. canonical repository root;
2. current branch from `git symbolic-ref --quiet --short HEAD`; and
3. push destination from `git rev-parse --abbrev-ref --symbolic-full-name
   @{push}` when available.

State is cached by canonical effective cwd and read from at most eight distinct
cwd values per tool call. A push beyond that budget has unresolved state and
runs no Git subprocess.

An explicit protected destination asks. Force/bulk asks. A bare push, remote-
only push, or `HEAD` refspec asks when current branch or resolved push
destination is protected. A feature source configured to push to protected
destination therefore asks. Failed preflight records observation and otherwise
allows.

## Mode decision

Shield evaluates credential/audit direct access, catastrophe, deletion
boundary, protected push, then default allow. Off returns allow without shadow.
Audit evaluates shield, returns public allow/default.allow, and retains the
shield result in shadow. Audit never calls confirmation.

Canonical path resolution failure occurs before a normalized operation exists.
Shield returns deny/path.resolution-failed, audit returns public
allow/default.allow with deny/path.resolution-failed in shadow, and off does
not inspect the operation.
