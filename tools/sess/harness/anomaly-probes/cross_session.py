"""Cross-session intervention census. Metadata only: per session, the
assistant models served, any harness-recorded refusal/fallback system
records, and the pattern-category profile of the session's own tool inputs.

No message content is read for display; regexes match in memory and only
labels and counts are printed.

Usage: cross_session.py DIR
"""
import json
import pathlib
import re
import sys
from collections import Counter

CATEGORIES = [
    ("source-patch-script", re.compile(r"write_text\(s\.replace|p\.write_text\(m\b|\.replace\(old, *new")),
    ("self-labelled-mutation", re.compile(r"mutation applied|mut\d|mutation:|witness|mutated")),
    ("guard-removal-language", re.compile(r"removed|relax|regress|strip.*check|disable")),
    ("validation-guard-touched", re.compile(r"ValidScope|ValidLane|IsInf|escap|traversal|canonicaliz|supersedes|fsync")),
    ("history-rewrite", re.compile(r"commit --amend|--amend|force|reset --hard")),
    ("fixture-or-transcript", re.compile(r"testdata/transcripts|redact-transcript|EXPECTED\.json")),
]

root = pathlib.Path(sys.argv[1])
for path in sorted(root.glob("*.jsonl"), key=lambda p: p.stat().st_mtime):
    records = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except Exception:
                    records.append({})
    if len(records) < 5:
        continue

    models = Counter()
    system_subtypes = Counter()
    counts = Counter()
    last_by_model = {}
    for i, r in enumerate(records):
        kind = r.get("type")
        if kind == "system" and r.get("subtype"):
            system_subtypes[r["subtype"]] += 1
        msg = r.get("message") or {}
        if kind == "assistant":
            m = msg.get("model")
            if m:
                models[m] += 1
                last_by_model[m] = (i, r.get("timestamp", "")[11:19])
            content = msg.get("content")
            if isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get("type") == "tool_use":
                        blob = json.dumps(b.get("input") or {}, ensure_ascii=False)
                        for label, rx in CATEGORIES:
                            if rx.search(blob):
                                counts[label] += 1

    interventions = {k: v for k, v in system_subtypes.items()
                     if "refus" in k or "fallback" in k or "safet" in k}
    substituted = len(models) > 1
    # A session that simply ends with no assistant record after its last
    # user message is the "total silence" grade from the first incident.
    tail_kinds = [r.get("type") for r in records[-6:]]
    silent_tail = "assistant" not in tail_kinds

    print(f"\n{path.name[:8]}  records={len(records):5d}")
    print(f"  models: {dict(models)}")
    if substituted:
        print(f"  SUBSTITUTION: yes  last-per-model={last_by_model}")
    print(f"  harness refusal/fallback records: {interventions or 'none'}")
    print(f"  silent tail (no assistant in last 6 records): {silent_tail}")
    print(f"  pattern profile: "
          f"{ {k: v for k, v in counts.items() if v} }")
