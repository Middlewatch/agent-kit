"""Does this session's context actually contain transcript-shaped content,
and was it compacted before the refusal?

Shape is tested by co-occurrence of structural markers inside a single
tool_result. Only counts, record indices and byte sizes are printed — the
matching text is never emitted, which is the whole point.

Usage: shape_probe.py SESSION.jsonl REFUSAL_INDEX
"""
import json
import sys

path, refusal = sys.argv[1], int(sys.argv[2])
records = []
with open(path, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except Exception:
                records.append({})

PLACEHOLDER = {"alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf",
               "hotel", "india", "juliet", "kilo", "lima", "mike", "november",
               "oscar", "papa"}

conv_shape = []      # conversation-log shape: role/stop_reason/isMeta together
placeholder_hits = []  # redacted-fixture vocabulary present
tag_markup = []      # harness envelope tags present
compactions = []

for i, r in enumerate(records):
    if r.get("type") == "system" and "compact" in str(r.get("subtype", "")):
        compactions.append((i, r.get("timestamp", "")[11:19]))
    if r.get("subtype") == "compact_boundary":
        compactions.append((i, r.get("timestamp", "")[11:19]))
    content = (r.get("message") or {}).get("content")
    if not isinstance(content, list):
        continue
    for b in content:
        if not isinstance(b, dict) or b.get("type") != "tool_result":
            continue
        blob = json.dumps(b.get("content"), ensure_ascii=False)
        n = len(blob.encode("utf-8", "replace"))
        markers = sum(m in blob for m in ('"stop_reason"', '"isMeta"', '"tool_use"', '"role"'))
        if markers >= 3:
            conv_shape.append((i, n, markers))
        words = set(blob.lower().replace('"', " ").replace(",", " ").split())
        overlap = len(PLACEHOLDER & words)
        if overlap >= 6:
            placeholder_hits.append((i, n, overlap))
        tags = sum(t in blob for t in ("task-notification", "system-reminder",
                                       "command-args", "command-name",
                                       "local-command-stdout"))
        if tags >= 2:
            tag_markup.append((i, n, tags))

def report(label, rows):
    before = [r for r in rows if r[0] < refusal]
    print(f"\n{label}: {len(rows)} tool_result(s) total, {len(before)} before the refusal")
    for i, n, extra in rows[:10]:
        side = "before" if i < refusal else "after"
        print(f"   record {i:5d} ({side}) {n:7d} bytes, markers={extra}")

report("conversation-log shape (>=3 structural markers)", conv_shape)
report("redacted-fixture vocabulary (>=6 placeholder words)", placeholder_hits)
report("harness envelope tag markup (>=2 tags)", tag_markup)

print(f"\ncompaction boundaries: {compactions or 'none'}")
print(f"total records: {len(records)}, refusal at {refusal}")
