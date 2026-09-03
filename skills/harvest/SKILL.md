---
name: harvest
description: "Capture a genuinely surprising coding result the moment you hit it, with the minimal artifact that proves it, so it can be referenced or built on later. Use automatically mid-session or at a close-out sweep. The trigger is a finding that contradicted a reasonable expectation, cost real debugging time, or required a non-trivial solution."
---

# Harvest

Harvest is an in-flight capture tool. Write the surprise down where it belongs, then get
back to the task.

## Capture when

- **It contradicted a reasonable expectation, or cost real debugging time.** The docs
  implied X and reality is Y, or the corpus said an API doesn't exist and it does, or
  settling it took a bisect, a throwaway probe, or a wire capture.
- **It required a non-trivial solution.** You had to derive an approach not found in the
  available docs, source, or corpus guidance, and writing it down saves a future writer
  the same derivation.

Any one is sufficient, and all are checkable after the fact, which stops the bar drifting
toward "everything felt interesting."

If the compiler already captures the problem, it does not need to be harvested. Avoid
restatements of what the source plainly says, or your own coding mistakes with no general
lesson. Capturing feels productive and costs the capturer nothing, which is why the bar
is explicit.

The bar in practice:

- **Captures:** "the corpus said `Writer.Allocating` has no `written()` accessor. It does,
  found while reading heartwood's transport." Recorded guidance was wrong and settling it
  cost you a real search.
- **Does not capture:** "output was empty because I never called `flush()`." This is a
  personal mistake and the docs cover it. There isn't a general lesson to learn here.

## Capture formatting

The minimal proving artifact is mandatory. A description of the hangup without the thing
that shows it makes the next reader reconstruct what you already had in front of you.
Paste the minimal snippet or present the artifact that demonstrates the behaviour: the
error text verbatim, the offending bytes, or the measured numbers. Extract the code
*now*, while the source is still there, and record the repo, path, commit, and date beside
it. A `path:line` citation is provenance rather than a substitute for the artifact itself.
Running verification at capture time is optional, but say so when you skip it. An
unverified finding carries the UNVERIFIED stamp shown below.

Representative example:
````markdown
## `Writer.Allocating.written()` exists
**UNVERIFIED — captured in-flight 2026-07-27**

Expected no such accessor (the corpus said there was none). It exists.

```zig
var w: std.Io.Writer.Allocating = .init(gpa);
try w.writer.print("x={d}", .{9});
// -> w.written() == "x=9"
```

Evidence: heartwood `core/daemon/transport.zig` calls it in its read path.
````

An **UNVERIFIED** entry is a lead rather than citable authority. Verification
and the owner's ruling are both required before it enters `CONVENTIONS.md`.

A finding that is true due to a current toolchain defect carries an
inline `**EXPIRES — delete when <condition>**` on the entry itself. That
marker is what the prune sweep greps for.

When a capture contradicts existing pack content, amend the existing entry and
note the correction in the ledger, rather than appending a contradicting sibling
for the next reader to reconcile.

## Where it goes

**A coding language**: a pack under `~/.agents/reference/coding-languages/`. If no
pack exists for the language, `init` a candidate pack and capture into it.
A coding-language finding always lands in a pack rather than the inbox.

- The finding goes in the matching `references/` file: the version map for an API shape, a
  topic reference for a pattern.
- The code goes in `examples/` when it can stand alone as a compiling file (the directory
  is created with its first example), or inline in the reference when it makes sense in
  context.
- Append one line to the pack's `HARVEST_LOG.md`: `date | action | rule-or-slug | evidence
  | ruling | <repo> @<sha> <path>` with action one of `add-reference | reference-facts |
  new-rule | patch-rule | ratify-with-expiry | prune-check`.
- A `candidate`-status pack still receives captures, but its contents don't yet answer
  resolution and its `CONVENTIONS.md` holds at most an owner-ruled seed set (S-prefixed
  rules from a research pass, which reps promote, sharpen, or delete). Resolve it with
  `--include-candidate`.

**Anything else** (a systemd gotcha, a provider's wire behaviour, a
build-tooling trap) goes to the capture inbox per the existing convention:

```
~/.agents/inbox/YYYY-MM-DD_HHMMSS_<host>_<slug>.md
```

with the standard frontmatter (`source: <host>`, `type: observation`, `title:`,
`timestamp:`), the same code-plus-claim body, and a line naming the surface it applies to.
Never copy credentials, private payloads, or full session transcripts into a pack or an
inbox file. Cite the durable local path and summarise the lesson. Sorting is deferred and
not the concern of the harvester.

## Trust levels in a pack

- `CONVENTIONS.md`: **User gated.** Only the owner's accept/edit ruling puts a rule here.
  Compact, positive, one page.
- `references/`: version maps and detailed patterns. A fact may be written directly **when
  it ships with its verification**. What protects an ungated reference is evidence depth
  rather than judgment.
- `examples/`: self-contained files that compile and pass their own tests against the
  pinned toolchain, declared in `manifest.json` with the reference they prove and the date
  they were last green.
- `adjudications/`, `HARVEST_LOG.md`: provenance and rejected alternatives rather than
  instructions.

## Upgrading a capture to verified

Worth doing when a finding starts getting cited, or during a prune sweep.

1. Write the probe, either a throwaway test file against the pack's pinned toolchain or a
   permanent `examples/` entry if the finding deserves one.
2. Run it. If it contradicts the capture, the capture was wrong. Fix or delete it and say
   so in the ledger.
3. Drop the UNVERIFIED stamp, cite the probe, log the line.

Read the **whole declaration** rather than a line window. Absence generalised from a partial read
is how a wrong fact gets in: one entry claimed a method did not exist because the harvest
had cited lines 2502–2650 and the method sat at 2687.

## Prune when the toolchain moves

1. Run every `examples/` file first. A failure names the references needing revision
   before you read a word.
2. Recheck version references against the installed compiler and source.
3. Delete or retire what the compiler now enforces or the toolchain invalidates, and
   preserve the ruling in the ledger.
4. Re-verify provenance paths in the same pass and repair any that moved.
5. Grep for `EXPIRES` markers, the entries pinned to a defect that may now be fixed.

## Starting a new pack

Only after a real build or review in that language produces evidence. Research alone
identifies questions and does not activate conventions.

```bash
S=~/.agents/kit/skills/harvest/scripts/language_corpus.py
python3 $S resolve zig                                     # find an active pack
python3 $S resolve go --include-candidate                  # candidate packs too
python3 $S init --language Odin --slug odin --toolchain dev-2026-07
python3 $S validate                                        # whole corpus
```

`validate` enforces that a declared example exists, names an existing reference, and pins
a toolchain the manifest lists. Run it whenever paths or manifests change. A `validate`
failure blocks the capture's commit rather than the session's main work.
