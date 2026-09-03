# Learning record format

Learning records live in `./learning-records/` and use sequential numbering: `0001-slug.md`, `0002-slug.md`, and so on. Create the directory lazily, when the first record is written.

They are the teaching equivalent of ADRs: they capture non-obvious lessons, key insights, and stated prior knowledge that will steer future sessions, and they are the input for calculating the zone of proximal development.

## Template

```md
# {Short title of what was learned or established}

{1-3 sentences: what was learned (or what prior knowledge was established), and why it matters for future sessions.}
```

That is the whole format. A learning record can be a single paragraph. The value is in recording that this is now known and why it changes what to teach next, rather than in filling out sections.

## Optional sections

Include these only when they add genuine value. Most records need none of them.

- **Status** frontmatter (`active | superseded by LR-NNNN`): useful when an earlier understanding turns out to be wrong and is replaced.
- **Evidence**: how the user demonstrated the understanding (a question answered, an exercise completed, prior experience cited). Useful when the claim might be revisited.
- **Implications**: what this unlocks or rules out for future sessions. Worth recording when non-obvious.

## Numbering

Scan `./learning-records/` for the highest existing number and increment by one.

## When to write a learning record

Write one when any of these is true:

1. **The user demonstrated genuine understanding of something non-trivial**: evidence they can use the concept correctly, beyond mere exposure. This sets a new floor for what to teach next.
2. **The user disclosed prior knowledge**: "I already know X." Record it so future sessions skip re-teaching it, and record the depth claimed.
3. **A misconception was corrected**: the user previously believed something wrong and now sees why. These are high-value records because they predict future stumbling blocks in related topics.
4. **The mission shifted in response to learning**: the user discovered they cared about something different than they thought. Cross-link to `MISSION.md` and update it.

### What does not qualify

- Material that was merely covered. Coverage is not learning. Wait for evidence.
- Anything already captured tersely in `GLOSSARY.md` as a term definition.
- Session-by-session activity logs. Learning records are decision-grade insights rather than a journal.

## Supersession

When a later record contradicts an earlier one (the user's understanding deepened or was corrected), mark the old record `Status: superseded by LR-NNNN` rather than deleting it. The history of how understanding evolved is itself useful signal.
