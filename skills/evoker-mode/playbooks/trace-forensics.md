### Trace forensics

**You own the diagnosis from the artifact.** For a handed-over capture (a
`.cpuprofile`, trace JSON, spindump, heap snapshot, core dump) paired with
"why is this slow / unresponsive / leaking / crashing". The capture already
exists; the artifact is a fixed dataset. Read it, don't re-run it. The
deliverable is a diagnosis, not a fix.

1. Identify the format and load it with the right tool. Parse large artifacts
   with a scratchpad script or an explore child (guard-the-context-window);
   only the reduced finding enters the main thread.
2. Transform the raw artifact into a queryable form: dump samples, frames, or
   nodes into sqlite or a TSV before reading. Reach the queryable shape first.
3. Narrow to the cause. Query for the frames holding the most time and walk
   the call tree to the hot path. For a leak, follow the retainer chain to a
   GC root. For a hang, find the thread stuck on-CPU or blocked and its wait
   reason.
4. Attribute to source: file, symbol, and line via the artifact's own symbols.
   A frame with no source mapping is not yet a diagnosis; resolve the symbols
   or state plainly that the artifact does not carry them.
5. Confirm against a paired capture when one exists. Diff before and after so
   the attribution is the regression, not background noise. Without one, mark
   the finding as the strongest hypothesis the artifact supports.
6. Hand back a cited diagnosis. Route to Bug fix or the `diagnose` skill once
   the cause is known.

**Reply:** the artifact and format, the reduced finding, the source location,
the artifact paths, and whether a paired capture confirmed it.
