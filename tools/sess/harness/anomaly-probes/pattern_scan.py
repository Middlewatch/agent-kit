"""Classify this session's own tool inputs by pattern, printing labels and
counts only — never the command text.

The question: what kind of activity accumulated in context before the
refusal fallback fired. Categories are chosen to test the hypothesis that
scripted in-place removal of validation/escaping guards from source (the
falsification-witness method this build uses) is the pattern-match, rather
than the transcript-fixture hazard from Phases 4.

Usage: pattern_scan.py SESSION.jsonl [REFUSAL_RECORD_INDEX]
"""
import json
import re
import sys

path = sys.argv[1]
refusal_at = int(sys.argv[2]) if len(sys.argv) > 2 else None

records = []
with open(path, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except Exception:
                records.append({})

# Each category is (label, compiled regex). Matching is done against the
# tool input; only the label is ever printed.
CATEGORIES = [
    ("source-patch-script", re.compile(r"write_text\(s\.replace|p\.write_text\(m\b|\.replace\(old, *new")),
    ("self-labelled-mutation", re.compile(r"mutation applied|mut\d|mutation:|witness|mutated")),
    ("guard-removal-language", re.compile(r"removed|relax|regress|strip.*check|disable")),
    ("revert-language", re.compile(r"revert|restored|git checkout|reverted")),
    ("validation-guard-touched", re.compile(r"ValidScope|ValidLane|IsInf|escap|traversal|canonicaliz|supersedes|fsync|sync")),
    ("history-rewrite", re.compile(r"commit --amend|--amend|force|reset --hard")),
    ("fixture-or-transcript", re.compile(r"testdata/transcripts|redact-transcript|EXPECTED\.json|fixture")),
]

counts = {label: 0 for label, _ in CATEGORIES}
first_hit = {}
hits_by_record = {}

for i, r in enumerate(records):
    if r.get("type") != "assistant":
        continue
    content = (r.get("message") or {}).get("content")
    if not isinstance(content, list):
        continue
    for b in content:
        if not isinstance(b, dict) or b.get("type") != "tool_use":
            continue
        blob = json.dumps(b.get("input") or {}, ensure_ascii=False)
        for label, rx in CATEGORIES:
            if rx.search(blob):
                counts[label] += 1
                first_hit.setdefault(label, i)
                hits_by_record.setdefault(i, set()).add(label)

print("category counts across the whole session (labels only):")
for label, _ in CATEGORIES:
    fh_i = first_hit.get(label)
    print(f"  {label:26s} {counts[label]:4d}   first at record {fh_i}")

if refusal_at:
    print(f"\nsource-patch + mutation activity by 100-record window "
          f"(refusal fallback at {refusal_at}):")
    span = 100
    top = ((len(records) // span) + 1) * span
    for lo in range(0, top, span):
        window = [i for i in hits_by_record
                  if lo <= i < lo + span and
                  ({"source-patch-script", "self-labelled-mutation"} & hits_by_record[i])]
        guard = [i for i in window if "validation-guard-touched" in hits_by_record[i]]
        if window:
            mark = " <-- refusal window" if lo <= refusal_at < lo + span else ""
            print(f"  records {lo:5d}-{lo+span-1:5d}: "
                  f"{len(window):3d} patch/mutation calls, "
                  f"{len(guard):3d} touching a named guard{mark}")

    print("\nthe 12 patch/mutation calls closest before the refusal:")
    near = sorted(i for i in hits_by_record
                  if i < refusal_at and
                  ({"source-patch-script", "self-labelled-mutation"} & hits_by_record[i]))
    for i in near[-12:]:
        ts = records[i].get("timestamp", "")[11:23]
        print(f"  record {i:5d} @ {ts}: {sorted(hits_by_record[i])}")
