### Long-horizon planning

**You own the decision map, not the build.** For "plan this out", "long
horizon planning", an idea too big or foggy to settle in one conversation,
or a `spec` session that stopped on open forks. Distinct from the `spec`
skill, which settles one buildable effort in one grilling conversation;
this shape feeds `spec` and writes no slices. The map format and session
rules are `guidance/planning-map.md`; read it before step 1.

1. Load the map, `docs/plans/<slug>.md`. When none exists, chart one: grill
   the owner to name the goal, run one breadth-first round across the whole
   space to surface open questions and not-yet-specifiable areas, write the
   map, and stop. When charting surfaces no open forks, the effort fits one
   `spec` session; route there instead.
2. Choose one open question: the owner's pick, else the first unblocked
   one.
3. Resolve it by its type per the guidance: research goes to delegate
   research children or the `deep-research` skill; an observable fork to
   the Prototype playbook; an owner judgment to grilling rounds (the owner
   answers, never you); a manual blocker gets done directly, or via the
   `wizard` skill when only the owner can.
4. Update the map: append the decision (the `adr` skill when it qualifies),
   delete the question, graduate newly specifiable areas, delete
   invalidated questions, move mis-scoped ones to Out of scope.
5. When a settled region is big enough to build, say so. The hand-off is a
   `spec` session, not more planning.
6. Stop after one question (research batches excepted).

**Reply:** the question resolved and its answer, the map changes in one
line (graduated, deleted, moved), and the next unblocked question or the
`spec` hand-off.
