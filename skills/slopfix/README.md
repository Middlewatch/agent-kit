# slopcheck

`slopcheck` locates prose patterns for contextual review and checks two house
conventions: em dashes and curly quotes. It reads Markdown or plain text, writes
a report, and never edits the input. It measures neither writing quality nor
AI authorship.

Run it while reviewing a document, then inspect the passages it identifies:

```bash
slopcheck -w README.md
slopcheck -p technical -w design.md
printf '%s\n' 'Foster reviewed the patch.' | slopcheck -w -
```

The last example produces a vocabulary advisory, not a failure or an instruction
to change the name.

The kit installer links `slopcheck.py` onto PATH. Without the link, invoke
`python3 slopcheck.py` from this directory. The script uses the Python standard
library only. `references/prose-standard.md` owns document-style preferences;
`SKILL.md` describes the editing pass.

## Findings and exit status

| Report tag | Meaning | Affects exit status? |
|---|---|---|
| `FLAG` | Em dash or curly quote found in exposed text | Yes |
| `NOTE` | Vocabulary, sentence shape, possible emoji, or technical notation worth inspecting | No |
| `ok` | This check found no match or did not cross its advisory threshold | No |
| `--` | Informational count or insufficient sample for sentence shape | No |

Exit codes are 0 for no convention flags, 1 for convention flags, and 2 for an
input or usage error. With multiple inputs, any convention flag
makes the result 1; an error takes precedence and stops processing. Earlier
input reports may already have been written.

Advisory findings, including entries added by an overlay, never change the
exit status, and there is no strict mode that promotes them to failures.

An em-dash flag is always a fix. A curly-quote flag inside a quoted literal is
the one case to review before changing, and there is no per-occurrence
suppression syntax for it, so adopt the exit-status check in a project gate
only where such literals are absent or already accounted for.

## Options

| Option | Purpose |
|---|---|
| `-w`, `--where` | Show up to 20 locations per rule, then the remaining count |
| `-v`, `--verbose` | Add word/sentence counts, mean length, type-token ratio, contractions, and line counts |
| `-q`, `--quiet` | Suppress reports; errors still go to stderr |
| `-p`, `--profile NAME` | Select `house` (default) or `technical` |
| `--overlay FILE` | Apply a lexicon overlay; repeat for multiple files |
| `-h`, `--help` | Show usage and overlay syntax |
| `-` | Read stdin once, in argument order alongside any files |

Locations are 1-based. Vocabulary findings report source lines; typography and
notation findings report line and UTF-8 byte column, not display column.

The `house` profile includes vocabulary and rhythm advisories, possible emoji,
and the two typography conventions. `technical` adds three notation advisories:

- `optional-plurals`: attached `(s)` or `(es)`, as in `port(s)`. Choose a number
  when the context allows it. Single-letter forms such as `H(s)` are excluded;
  longer mathematical expressions can still match.
- `time-marker`: forms such as `10PM` or `10pm`; the house form is `10 PM`.
  Preserve exact source strings where required.
- `heading-period`: a final period on an ATX heading. Recognized abbreviations,
  such as `U.S.`, are excluded; abbreviation coverage is incomplete.

## Coverage and limitations

| Check | Text inspected |
|---|---|
| Vocabulary and sentence statistics | Paragraph prose only; headings, table rows, blockquotes, list items, and indented list continuations are excluded |
| Em dashes, curly quotes, possible emoji, optional plurals, time markers | Exposed text, including headings, tables, blockquotes, and list items |
| Heading periods | ATX headings (`# Heading`), not setext headings |

Both text views share exclusions for fenced and indented code, HTML comments,
same-line inline code spans, and same-line link destinations and titles. The
sentence view substitutes one word for each code span. The tool is a small
line-oriented scanner, not a full Markdown parser: multiline inline constructs,
frontmatter, reference-style links, and HTML other than comments do not receive
special handling. Four-space indentation is treated as code even inside a list.

Vocabulary and word counting are English/ASCII-oriented. Sentence boundaries
handle a small abbreviation list, decimals, parentheses, and code-formatted
starts. Counts remain approximate. A vocabulary match can be a proper name or
legitimate domain term. Emoji candidates use approximate ranges and presentation
markers, not a complete Unicode emoji database; a match cannot establish that a
symbol is decorative. These limitations are reasons to inspect the source.

Sentence-shape advisories require at least 10 sentences and 150 prose words:

- `burstiness` reports the coefficient of variation of sentence lengths and
  notes a value below 0.45.
- `mid-band` notes when at least 60% of sentences contain 14 to 22 words.

These are review heuristics, not target ranges. Joining sentences, moving prose
into lists, or dropping below the sample floor can clear an advisory without
improving the document. Avoid adding filler, fragments, or compound sentences
just to move the numbers. Neither a threshold crossing nor a clean report proves
that the writing changed for the better.

## Lexicon overlays and suppression

An overlay contains one directive per line. Blank lines and lines beginning with
`#` are ignored. For example, an illustrative `project.lex` could contain:

```text
# A name used in this project
drop foster
# Add a phrase to inspect, not a forbidden phrase
signposting phrase as everyone knows
# Reclassify an existing entry
soft word delve
```

Run `slopcheck --overlay project.lex -w document.md`. Directives are:

- `drop TEXT` removes an entry.
- `CLASS MATCH TEXT` adds or replaces an entry with the same normalized text.

Classes are `focal`, `soft`, `signposting`, `closing`, `sycophancy`, and
`contraction`. All except `contraction` yield advisories; contractions are an
informational count. Match kinds are:

| Kind | Match |
|---|---|
| `word`, `phrase` | Case-insensitive text with word boundaries at both ends |
| `word-lower` | Bounded text only where written in lowercase |
| `sent-init` | Phrase at an approximate sentence start |
| `discourse` | Sentence-initial word immediately followed by a comma |
| `substring` | Text anywhere, without boundaries |

Overlay text is lowercased and internal whitespace collapsed. Overlays apply
in argument order; later entries replace earlier entries for the same text.
They customize the lexicon, not convention severities or shape thresholds.

A document intentionally discussing the lexicon can suppress its vocabulary
checks with this exact first nonblank line (an optional UTF-8 BOM is allowed):

```html
<!-- slopcheck: ignore lexicon -->
```

The directive suppresses all lexicon classes and overlays for that input only.
It leaves sentence-shape, typography, and technical checks active. A later HTML
comment has no directive effect. Suppression is optional; keeping a justified
advisory requires neither an edit nor a suppression marker.

## Design and verification

One script separates scanning, profiles, evaluation, reporting, and CLI handling.
Scanning supplies two views with shared inline exclusions: paragraph text for
lexicon/shape analysis and a source-sized mask for exact typography locations.
Profiles decide which findings are advisory or conventions; reporting does not
change severity. Input is capped at 64 MiB per document.

External harnesses exercise the real CLI, including exit status, exclusion
boundaries, advisory counts, overlays, and negative cases. Run from this directory:

```bash
for suite in cli behaviors overlay technical notation; do
    python3 "tests/test_${suite}.py" ./slopcheck.py || exit
done
```
