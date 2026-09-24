---
name: slopfix
description: "Rewrite a document to the house prose standard without changing a fact. Use when the owner asks for a slopfix or prose pass. Not for ordinary replies."
---

# Slopfix: the prose editing pass

Read `references/prose-standard.md` before editing. It owns the document-style
preferences; this skill owns the editing procedure. Ordinary replies follow the
writing guidance in `~/.agents/AGENTS.md`. An explicit request to edit a previous
answer can use this procedure on that answer alone.

## Outcome and boundaries

Success is a clearer target document with its substantive information intact.
Preserve facts, names, numbers, claims, qualifications, uncertainty, and modality.
Redundant expression can go when its information remains elsewhere in the target.
A link alone does not establish that deleting a passage preserves that information.

The pass edits living documents. Entries already written in an append-only
ledger, creative or personal writing, and code are out of scope unless the
request names them. Preserve an
intentional register. If a claim appears stale, report it and leave it unchanged
unless content correction is part of the request. A prose pass does not initiate
another workflow or authorize behavior changes.

## Procedure

1. **Select.** Work on the named targets. If the owner requests a corpus pass,
   bound the corpus before inspecting it; lint counts alone do not rank writing
   quality.
2. **Read and revise.** Read each target in full. Apply the standard's tests for
   that document's reader need. Rewrite where the edit improves comprehension;
   retain correct wording when the proposed change only satisfies a pattern.
3. **Review.** Use `slopcheck -w <target>` to locate possible issues, then judge
   them in context. Advisory findings can remain without individual explanations.
   An em-dash flag is always a fix; check a curly-quote flag inside a quoted
   literal against the standard before changing it.
   Fact-walk the diff: substantive information and qualifications must survive.
4. **Report.** Summarize the edits and verification. Report unresolved substantive
   issues, justified convention exceptions, and useful relocation candidates as
   follow-ups. Those suggestions do not block completion of the prose pass.

## Verification and tool maintenance

The diff and the applicable reading tests establish whether the edit succeeded.
A clean lint result establishes neither clarity nor factual accuracy.

`slopcheck.py` is linked onto PATH by the kit install. If the link is missing, run
it with `python3`. See `README.md` for the CLI contract, profiles, exclusions, and
lexicon overlays. After editing the script, run its five external harnesses:

```bash
for suite in cli behaviors overlay technical notation; do
    python3 "tests/test_${suite}.py" ./slopcheck.py || exit
done
```
