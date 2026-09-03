# Known limitation: the provenance ledger scrapes citations from tool content

**Filed:** 2026-08-21, from the second review pass of the loaded extension.

**Status:** Documented, not scheduled. The current behaviour is acceptable
under the cooperative-child threat model; revisit only if we start delegating
to genuinely untrusted children.

## What the ledger does

`provenanceFromToolResult` (`src/provenance.ts`) builds one evidence entry per
child tool call. Alongside the structural references it derives per tool (the
`inspect_read` line range, `inspect_git_diff` hunks, `web_fetch` final URL), it
also runs `extractCitations` over the *entire* tool-result text, recording
every URL and `path:line[-line]` string it finds. `unmatchedCitations` then
compares the child's final citations against that ledger, and
`requireMatchedCitations: true` fails the call on any unmatched one.

## The two residuals

**Fabrication (false support).** Because the scan reads the full body, a
`path:line` token sitting inside file or page *content* the child read is
recorded as support. A child can then cite `foo.ts:42` because some file it
opened merely mentioned `foo.ts:42`, without ever inspecting that location. A
match therefore proves the child saw the token, not that the location is real.

**Over-flagging (false negatives).** The `path:line` regex also matches
colon-number tokens in prose (clock times, `RFC:2119`-style references), so a
legitimate answer can be failed under strict mode for a citation that was never
a file reference.

## Why it is not scheduled

Enforcement is opt-in, and the child is a cooperative model doing best-effort
work rather than an adversary forging our own audit trail. The common failure
(a citation invented from nothing) is already caught, because an invented
`path:line` appears in no tool result. The fabrication path requires the child
to have read content containing the exact string it wants to fake-cite, which a
hallucinating model does not do and an adversarial one is out of scope. The
practically annoying half is the false negatives, and the honest mitigation is
to leave `requireMatchedCitations` off when the answer legitimately carries
colon-number prose, which the README now states.

## The fix, if it is ever warranted

Derive references structurally per tool and drop the blanket body scan for
content-bearing tools: `inspect_read` contributes only its own read range,
`inspect_grep`/`inspect_find` the matched paths (and grep line), `web_fetch`
the final URL, `web_search` the result URLs, `inspect_git_diff` the parsed
hunks. That makes a match mean "the child looked at this location," not "this
string appeared in something the child looked at." Localised to
`src/provenance.ts`; the trigger is delegating to untrusted children.
