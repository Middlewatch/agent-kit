---
name: vet-dependency
description: "Run the evidence-based vetting checklist before adopting any new third-party dependency, tool, service, CI action, or MCP server, and at the commit that introduces one."
---

# Vet a dependency

Produce an evidence-backed adopt/watch/skip verdict for anything third-party
entering the estate, recorded where the dependency lands so the reasoning
survives with the code.

The trigger is adoption: a diff that adds a `build.zig.zon` entry, a
package-manifest line, a `uses:` in CI, an MCP server registration, a new
binary on PATH, or a vendored clone. When a commit introduces one of these and
no vetting record exists, run this before committing. An already-vetted
dependency re-triggers on risk-relevant change rather than only on a version
bump. A risk-relevant change is a major upgrade, a change of distribution
channel or ownership or license, new install-time execution, a privilege
increase, or a security incident in the dependency.

Each check maps to a documented failure class from the verified research record
(`~/.agents/wiki/knowledge/software-architecture/foss-developer-tooling-2026.md`, with Zig
specifics in `~/.agents/reference/coding-languages/zig/references/toolchain-and-ecosystem.md`). The
incidents and figures behind each check live in that record rather than here. Every
item is a fast lookup. Depth of investigation scales with blast radius, so a
dev-only formatter earns a lighter pass than a network daemon or anything that
executes at install time.

## The checks

1. **Find the canonical home.** GitHub activity is not a health signal for projects that migrated.
   Check `archived` status, mirror markers, and `original_url` on Forgejo instances. Everywhere,
   track commit cadence rather than stars.
2. **Read the trailing-12-month commit graph and bus factor.** Stars and awesome-list rank don't
   necessarily carry meaning and sometimes indicate fossilized hype. One maintainer with no
   releases in a year is a strong adverse indicator. "Finished, not dead" is also real.
   Distinguish it by whether issues still get answered.
3. **License, verbatim.** Open the LICENSE file rather than trusting the repo badge (GitHub
   reports NOASSERTION on non-SPDX layouts, and some "open" projects are FSL/BSL
   source-available). No license file is a blocking indicator for anything that ships.
4. **Rug-pull posture.** The strongest predictor is CLA-concentrated copyright + VC funding +
   company-held trademark. Moat features migrating to an enterprise tier is a rug-pull in
   progress. Foundation/coalition governance or forkable name+infra is the escape hatch.
5. **Benchmark hygiene.** A vendor performance claim without a public reproduction repo is
   marketing. ripgrep/fd-grade published methodology is the bar.
   Absence of benchmarks is acceptable, but unreproducible ones are suspect.
6. **Toolchain compatibility.** For Zig, check `minimum_zig_version` in `build.zig.zon` against
   the project's pinned toolchain. A repo untouched since before the previous Zig release
   likely no longer builds, so verify rather than assume. Equivalent staleness checks apply per
   ecosystem.
7. **Does the toolchain already do this?** ccache/sccache add nothing to Zig, and filesystem/git
   MCP servers duplicate harness-native tools. Prefer the built-in.
8. **Supply-chain posture at install.** Pin by hash where the ecosystem supports it
   (`build.zig.zon` does this natively, lockfiles elsewhere). MCP servers and AI-adjacent
   tools get the stricter tier: read the tool descriptions you're installing (poisoning vector),
   never bind 0.0.0.0, pin the version, and treat any remote server as an RCE vector against this
   machine.

The named patterns above are risk indicators to weigh together against blast
radius rather than verdict shortcuts. A single adverse indicator on a low-risk
tool can still land at adopt with the indicator noted, and a clean checklist
on a high-risk tool can still land at watch. In practice, a single-maintainer,
MIT-licensed, dev-only formatter with a quiet year lands at adopt with the
bus factor noted, and a fresh network-facing MCP server with an active repo
and a clean license still lands at watch until the stricter tier's checks are
all green.

## Verdict and record

Conclude adopt, watch, or skip with the strongest pieces of evidence, and
record it in the message of the commit that introduces the dependency. The
record covers the verdict, canonical home, license, cadence, and the evidence
that carried the decision. A fuller body is fine, since one line is a floor.

When the evidence is insufficient to decide, that is itself the outcome.
Record `watch` naming the missing evidence rather than a guessed verdict.

Two calls are the owner's: adopting despite adverse indicators, and anything
paid or account-creating. A skip that would surprise the requester goes back
to the owner with the evidence rather than being silently swallowed.
