"""Content-free intervention scan of one Claude Code session transcript.

Prints ONLY: timestamps, assistant model ids, event types, tool names, and
byte lengths. No message content, no per-entry rendering, nothing that
reconstructs a conversation log. This constraint is load-bearing: three
logged incidents show that rendering transcript-shaped content into a tool
result is itself what fires the intervention.

Usage: model_scan.py SESSION.jsonl
"""
import json
import sys
from collections import Counter

path = sys.argv[1]
records = []
with open(path, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except Exception:
            continue

print(f"records: {len(records)}")

# Model per assistant record, in order, with timestamps.
timeline = []
for i, r in enumerate(records):
    ts = r.get("timestamp", "")
    kind = r.get("type", "")
    model = None
    if kind == "assistant":
        model = (r.get("message") or {}).get("model")
    timeline.append((i, ts, kind, model))

models = Counter(m for _, _, _, m in timeline if m)
print("\nassistant models seen:")
for model, n in models.most_common():
    print(f"  {model}: {n} records")

# Model transitions - the substitution signature.
print("\nmodel transitions (the substitution signature):")
prev = None
for i, ts, kind, model in timeline:
    if model and model != prev:
        if prev is not None:
            print(f"  record {i} @ {ts}: {prev} -> {model}")
        else:
            print(f"  record {i} @ {ts}: first assistant model = {model}")
        prev = model

# Last assistant record per model.
print("\nlast record per model:")
last = {}
for i, ts, kind, model in timeline:
    if model:
        last[model] = (i, ts)
for model, (i, ts) in last.items():
    print(f"  {model}: record {i} @ {ts}")

# Tool results by size, largest first - candidates for the trigger.
print("\nlargest tool_result payloads (bytes only, no content):")
sizes = []
for i, r in enumerate(records):
    if r.get("type") != "user":
        continue
    content = (r.get("message") or {}).get("content")
    if not isinstance(content, list):
        continue
    for block in content:
        if isinstance(block, dict) and block.get("type") == "tool_result":
            payload = block.get("content")
            if isinstance(payload, str):
                n = len(payload.encode("utf-8", "replace"))
            elif isinstance(payload, list):
                n = sum(
                    len(str(b.get("text", "")).encode("utf-8", "replace"))
                    for b in payload
                    if isinstance(b, dict)
                )
            else:
                n = 0
            sizes.append((n, i, r.get("timestamp", "")))
sizes.sort(reverse=True)
for n, i, ts in sizes[:12]:
    print(f"  record {i} @ {ts}: {n} bytes")

# Tool-use names in order with record index, so a size can be attributed
# to a tool without showing arguments.
print("\ntool_use call counts by name:")
names = Counter()
for r in records:
    if r.get("type") != "assistant":
        continue
    content = (r.get("message") or {}).get("content")
    if isinstance(content, list):
        for b in content:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                names[b.get("name", "?")] += 1
for name, n in names.most_common():
    print(f"  {name}: {n}")

# Stop reasons - a refusal or truncation shows here.
print("\nassistant stop_reasons:")
stops = Counter()
for r in records:
    if r.get("type") == "assistant":
        stops[str((r.get("message") or {}).get("stop_reason"))] += 1
for stop, n in stops.most_common():
    print(f"  {stop}: {n}")
