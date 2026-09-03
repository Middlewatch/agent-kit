# 0003: Public main starts from a fresh root; one npm package for the whole kit

Date: 2026-09-02
Status: accepted

## Context

The kit developed privately for 500+ commits while its GitHub remote carried a
single squashed "public tree" commit rebuilt by `bin/publish`, which also
dropped private-only paths (build plans, a retired predecessor, research runs)
from the export. Keeping two trees in sync was a recurring chore: local `main`
read hundreds of commits ahead of `origin/main`, the snapshot went stale for
weeks, and every publish was a force-push. The kit was also headed for npm so
the Pi community could install it by name and find it in the package gallery,
which raised whether each extension should be its own package.

## Decision

The private-only paths are deleted from the tree rather than filtered at
publish time. `main` restarts from one orphan commit of the swept tree; the
prior development history stays on a local-only branch and is never pushed.
From then on ordinary commits publish directly, guarded by `bin/check --lint`
and `bin/check --scan` in a pre-push hook. `bin/publish` and the `public`
branch are retired.

The whole repo is one npm package, `@middlewatch/pi-agent-kit`, with the
`pi-package` keyword. Consumers who want part of it use Pi's per-package
resource filtering.

## Consequences

One tree, one history, one version. A commit that leaks an owner string is
caught by the hook rather than by a later export step, and the pre-release
history never needs un-publishing because it never leaves the machine.
Contributors see a short history that begins at the first release.

Per-extension versioning is given up: every extension ships at the kit's
version. An extension that later earns its own release cadence moves to its
own repo, which is the kit's existing rule for `autojournal`, `context-fold`,
and `claude-go`.

## Considered options

Keeping the squash-publish flow: rejected because the chore it created was the
reason for the change. Pushing the full development history: rejected because
old commits contain the paths being retired and predate the lint gate, so a
history scan would have to be trusted instead of a fresh start. npm workspaces
with one package per extension: rejected as nine manifests and nine versions
for extensions with no runtime dependencies and no separate audience; the
skills, guidance, and tools would still need the root package.
