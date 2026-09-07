# Walkthrough revision ledger

## 2026-09-07 - Extract the live coaching loop

- Motivation: The owner asked to preserve the task, user action, observable check, and continuation pattern from the Dolphin and Neovim walkthroughs. The source conversations also exposed assumed starting state, curriculum drift, fragile macro replay, and lost continuation after a model change. Evidence is collected in `references/cases.md`.
- Change: Draft a conversation-first skill with one task per turn, setup checks, result-dependent continuation, and gradual removal of hints. Keep the existing course-workspace `teach` skill unchanged. Leave adoption to the owner's edit pass.
- Draft checks: Eight description-only routing probes matched the intended routes. Fresh-context responses exercised a paper-and-calculator topic, an empty-editor recovery, and continuation after context loss. The installed Pi loader discovered the draft and advertised it; removing its description caused rejection. Prose lint passed. These checks do not establish learning outcomes or automatic selection in an installed human-led session, which remains pending.
- Outcome (2026-09-07 Yazi trial): The owner explicitly invoked the draft and completed a goal-only organization challenge with no lookup reported and file outcomes checked. Navigation needed focused rehearsal; delayed retention remains unmeasured. The owner requested portable tutorial records after pausing. See `references/tutorials/yazi/TUTORIAL.md` and the candidate suggestions in `references/retention-review.md`.

## 2026-09-07 - Keep portable tutorial records

- Motivation: The Yazi trial left completed workflows and progress primarily in the conversation. The owner requested one per-topic `TUTORIAL.md` inside the skill for lookup and cross-machine resumption.
- Change: Add `references/tutorials/<topic>/TUTORIAL.md` and its index; make the skill read the record on entry and update assigned tasks, outcomes, and pause state. Seed the Yazi record from all 22 assigned exercises. Keep machine paths in local workspace notes and review-only teaching proposals outside the procedure.
- Draft checks: Pi's installed loader discovers one skill with no diagnostics. All seven relative Markdown links resolve; the fresh fixture recipe produces its expected files; the paused file state matches the tutorial. Kit lint and whitespace checks pass. Prose lint passes the Yazi tutorial and leaves sentence-variation advisories on the procedure, index, and review.
- Outcome: The Yazi record was reconstructed from this session. A fresh session has not yet exercised incremental record updates or cross-machine resumption.

## 2026-09-07 - Adopt retention guidance and historical records

- Motivation: The owner approved all four recommendations from the Yazi trial and requested the earlier Neovim and Dolphin logs, followed by repository publication and deployment.
- Change: Add recall before reminders, retrieval after intervening work and on resume, predictive checks for confusable operations, and mixed operation-choice tasks. Import 33 Neovim and 29 Dolphin exercise entries, preserving pending, skipped, failed, and confirmed outcomes. Bundle fresh Neovim practice inputs.
- Capture choice: Keep reusable tutorials and redacted user/assistant dialogue together in each topic directory so they travel with the skill. Raw harness logs remain local. This replaces workspace-only checkpoint storage without publishing raw tool payloads, images, identifying paths, or private reasoning.
- Evidence: Two independent source reconstructions were spot-checked against the raw-session text exports. An independent publication reviewer read both complete redacted logs and tutorials and found no material issues. A fresh-context resume probe assigned an earlier Yazi goal without a key reminder and asked about lookup or prompting.
- Checks: Pi discovers one skill with no diagnostics; 14 relative links resolve; exercise numbering is consecutive for all three topics. Fresh Neovim and Dolphin setup recipes produce the expected disposable files, and the Lua sample runs with the expected output. Kit lint, whitespace checks, and the configured identifying-string scan pass. Prose lint leaves sentence-variation advisories; historical dialogue retains its original prose.
- Limits: These checks establish record integrity, packaging, and a generated next-turn response. Incremental record updates and later learner retention still need a live follow-up. Historical desktop outcomes were not reenacted for publication.
