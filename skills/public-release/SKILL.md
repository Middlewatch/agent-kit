---
name: public-release
description: "Prepare a repo's public-release export (filtered tree, fresh orphan first commit, secret and size scans, license and CI safety review, external changelog, clean-room proof), then stop and hand the owner the export. Use when the owner asks to prepare a public release, publish a repo, or cut a public export."
disable-model-invocation: true
---

# Public release conversion

Turn a private development repo into a verified public export the owner can
push. The skill prepares and proves the export, then stops. Publishing
(creating the remote, pushing, announcing) is the owner's ruling, made after
reading the verification results.

## Outcome and boundaries

Success is an exported tree that passed every check below, sitting on a fresh
orphan commit with an annotated version tag, plus a short numbered list of the
decisions that remain the owner's (license, public identity, remote, the push
itself). Nothing leaves the machine. The development repo is never rewritten.

**Topology.** The development repo stays private and authoritative, and its
ledgers, packet history, and commit trailers are never rewritten. The public
repo is a separate remote populated from a filtered export of the tree. Its
first commit is a fresh orphan commit of the exported tree, tagged `v0.1.0`
for a first release. Pre-release history is never pushed, so nothing ever has
to be un-published. For an already-public repo, sweeps apply to future commits
only.

## Preconditions

- The living docs and code comments are already as-built. If phase codes,
  stale statuses, or estate paths survive in the living docs, run the
  `as-built` skill first.

## Sequence

1. **Sweep the export set.** Internal ledgers (`plans/`, execution logs, run logs, tracker
history), private doc directories, session logs, caches, spikes, and `artifacts/` stay
private. The freezable assets (`tests/`, `fixtures/`, `fuzz/seeds/`, and the gate script)
go public Ad-hoc spike harnesses may be swept, but the conformance harness may not.
2. **Instruction files.** `AGENTS.md`/`CLAUDE.md` and other development-facing
instructions stay in the private repo, and the export drops them. On the owner's request,
replace them with a `CONTRIBUTING.md` and a README build section written for an outside
builder.
3. **Secret scan.** Run a secret scanner (`gitleaks detect` or equivalent) over the
working tree and full history before the export is built. Any hit blocks the release and
forces credential rotation rather than just deletion.
4. **License.** A public repo ships a `LICENSE`. The choice is the owner's ruling, put to
the owner with a recommendation, and the release does not proceed until it is chosen. Fold
`SECURITY.md` and similar policy files into the same decision batch when relevant.
5. **Commit identity.** The export's commits carry the public identity the owner
designates. Verify on the exported branch that no estate email, machine name, or
`Plan:`/`Packet:` trailer survives.
6. **Impersonal prose.** Public-bound guidance and docs name roles rather than people: the
owner for authority and ratification, the user for interaction. A personal name written
into guidance gets reproduced into every document an agent later writes from it. Run
`~/.agents/kit/bin/check --scan <repo>` over the export; it reads the untracked
`bin/forbidden.local.txt` (untracked because a gate distributed with the identifiers it
guards would publish them) and fails on any hit across the tracked and
untracked-but-not-ignored files. Any hit blocks the release. Captured session transcripts,
agent artifacts, and personal run ledgers stay out of the export entirely, since raw logs
carry arbitrary conversation content and absolute host paths that no substring scrub can
be trusted to sanitize.
7. **CI safety.** Review every exported workflow: no self-hosted runner labels, no
`pull_request_target` checking out fork code, and no secret references the public repo
cannot satisfy. The gate script must run on a clean hosted runner.
8. **Dependencies.** The export carries the lockfile/checksums the charter requires, plus
a notices file for vendored third-party code. An unpinned or unattributed dependency
blocks the release.
9. **Size scan.** Enumerate every blob over ~1 MB (a starting-point threshold) and every
binary in the export. Each is justified as a needed fixture or removed before the first
push.
10. **Public changelog.** Internal changelogs and execution logs stay private. The export
carries its own `CHANGELOG.md` written for external readers, assembled from the plan
close-out summaries in Keep-a-Changelog form and dated at tag time, rather than generated
from internal commit subjects.
11. **Clean-room proof.** Clone the export into a clean container or fresh environment
with no estate paths, follow the README quickstart verbatim, and run the gate script.
Anything that fails or requires undocumented local state is a finding rather than a README
footnote.

## Verify and stop

Run the as-built marker sweep (the `as-built` skill's grep families) plus the checks above
over the exported tree and show them green. Each release is an annotated `v<semver>` tag
whose message matches the changelog entry. Then hand the owner the export for approval
with the open decisions numbered. The push is the owner's.

## Blocked outcomes

A secret-scan hit, a missing license ruling, or an unpinned dependency is a blocking
finding. Report it with evidence and stop. There is no degraded release, and a partial
export that skipped a check is not an outcome this skill produces.
