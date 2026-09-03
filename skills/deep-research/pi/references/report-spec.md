# Research report spec

The portable contract every harness and mode shares. The evidence-collection engine may differ
per harness (Claude Code or Pi) and per mode (research, deep), but the output and filing are
identical everywhere.

## Report format

Markdown, in this order:

1. **Answer up front.** 2–4 sentences: provide the conclusion, then the support.
   The goal is for any reader who stops here still to leave correctly
   informed.
2. **Body organized by theme.** Sources appear inline as citations, and themes structure the
   report.
3. **Inline citations.** Every non-obvious claim carries a `[n]` resolving to the numbered
   **Sources** list at the bottom. A citation points at a source that was actually fetched and
   read during the run. The citation lint (below) enforces that every marker resolves.
4. **Contradictions, gaps, and unverified claims** get their own short section. Where sources
   disagree, present the disagreement and the better-supported side. A claim that survived no
   independent confirmation ships marked **[unverified]** inline, at the claim,
   and a mention in this section. State inference as inference.
5. **Sources**: a numbered list of title, URL, and publication/last-updated date (or
   "accessed <date>" for living docs).

## Source standards

- Prefer primary sources: official docs, papers, standards, the project itself, original
  reporting. Aggregators and SEO content are leads to follow toward the primary source.
- One source is a lead. A load-bearing claim needs a second independent source or an
  **[unverified]** mark.
- Cover the source *types* the question implies, in addition to its topic facets. Measured
  evidence (papers, benchmarks, studies), official/vendor docs, and practitioner or critic
  reports each see things the others miss. A question about "what the evidence supports"
  answered from vendor docs alone is half a report.
- Record dates, since recency matters on fast-moving topics.

## Citation lint

```bash
python3 ~/.agents/kit/skills/deep-research/bin/citation-lint.py <report.md>
```

It checks that every inline `[n]` resolves to a numbered source, every source entry carries a
URL, and numbering is contiguous. Exit 0 ships. On exit 1, fix the named citations and re-run
until clean, and run it before filing. This code gate is what lets the report claim its
citations are real.

## Wiki filing (~/.agents/wiki/)

Format per `~/.agents/wiki/OKF_PROFILE.md`. Frontmatter:

```yaml
---
type: report
title: <human-readable title>
description: <one-line summary used to judge relevance during retrieval>
lane: <existing lane dir that best fits, knowledge/ for most external research>
privacy: cloud_ok        # default for web-sourced research, lower only if it embeds private context
timestamp: <ISO-8601 date>
---
```

Steps, in order:

1. Existing-note check. Search the target lane for a note already covering this topic
   (`grep -ril` over the lane's `index.md` and note files for the question's key terms). When
   one exists, update it in place. Fold the new findings in as a dated section or an
   in-place revision, extend its Sources list, and refresh `updated`. One canonical note per
   topic keeps the wiki greppable, and new siblings are for new topics.
2. Otherwise slugify the title → `wiki/<lane>/<slug>.md`. The `knowledge/` lane groups by
   topic directory, so a report lands at `knowledge/<topic>/<slug>.md`.
3. Body stands alone: the body contains findings and their support, written as one author's finished work,
   readable months later with no other document open.
4. Run `bin/gen-indexes` in the wiki. Lane indexes are generated from note frontmatter, so
   edit the note and regenerate rather than hand-editing an index. Git is the change log.
5. File into existing lanes automatically. Ask the user only when proposing a NEW lane
   (name + one-line rationale).

## Sources ledger

Sources outlive the report that found them. After filing, append a run section to the lane's
link-map so future agents can find every source by grep alone:

- File: `~/.agents/wiki/<lane>/link-maps/<domain>.md`, one file per broad domain (e.g.
  `ai-agent-engineering.md`, `homelab-hardware.md`). Create the file (and `link-maps/` dir)
  when the domain is new, and append when it exists.
- Section per run:

```markdown
## <report slug> — <date>
- <URL> — <title> — <date or accessed> — <one line: what this source is good for>
```

Every source from the report's Sources list gets a line. The one-liner is the retrieval hook,
so write it for a future agent who has the question but not the report.
