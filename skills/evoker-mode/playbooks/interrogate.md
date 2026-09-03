### Interrogate

**You own the verdict; the critics own the hunt.** For a contested design, a risky diff
before it ships, or "poke holes in this". Complementary to the `deep-review` skill, which
is a bounded single-reviewer audit with a findings artifact; Interrogate is a fast
multi-perspective adversarial pass whose output is a verdict in chat.

1. Fix the target (diff range, file set, or document) and write the shared context once:
   intent, the contract the artifact claims to satisfy, and how it will be used.
2. Pick two or three adversarial lenses that don't overlap. The productive set so far:
   correctness and edge cases; hostile input and robustness; contract conformance against
   the governing doc; simplicity and reader load.
3. Launch one `review` child per lens in a single message (the prose pool caps at three).
   Each brief carries: the lens, the shared context, the refutation rule (attempt a
   written refutation of every candidate, keep survivors), a findings cap with severities,
   a required Dismissed list, and permission for an honest empty report. Set
   `requireMatchedCitations` for code targets, and expect an occasional completed report
   to fail that gate; read its partial output rather than discarding it.
4. Act as lead judge: dedupe findings across critics, verify every load-bearing claim
   against the source yourself, and downgrade or discard what fails. The common failure
   modes are severity inflation, threat-model overreach, and misread context, so agreement
   between two critics is signal, not proof. Record dispositions with `assess_delegation`.
5. Fix accepted findings or route them: a defect → Bug fix; a design fault → the `adr` or
   `spec` conversation; a doc mismatch → edit the doc.

**Reply:** verdict first, accepted findings with severities and citations, what the
critics disagreed on, and discarded findings with the reason each was wrong.
