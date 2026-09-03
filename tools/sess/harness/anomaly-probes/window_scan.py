"""Metadata-only window scan around a suspected intervention point.

Prints per record: index, timestamp, type, model, block kinds, tool name,
and byte length. NEVER any content, argument value, or text. Tool names and
block kinds are structural labels the harness itself assigns, not content.

Usage: window_scan.py SESSION.jsonl LO HI
"""
import json
import sys

path, lo, hi = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
records = []
with open(path, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except Exception:
                records.append({"type": "UNPARSEABLE"})


def size_of(value) -> int:
    return len(json.dumps(value, ensure_ascii=False).encode("utf-8", "replace"))


for i in range(max(0, lo), min(len(records), hi)):
    r = records[i]
    kind = r.get("type", "?")
    ts = r.get("timestamp", "")[11:23]
    msg = r.get("message") or {}
    model = msg.get("model") or ""
    stop = msg.get("stop_reason") or ""
    content = msg.get("content")
    labels = []
    if isinstance(content, str):
        labels.append(f"str[{len(content.encode('utf-8','replace'))}b]")
    elif isinstance(content, list):
        for b in content:
            if not isinstance(b, dict):
                continue
            t = b.get("type", "?")
            if t == "tool_use":
                labels.append(f"tool_use:{b.get('name','?')}[{size_of(b.get('input'))}b]")
            elif t == "tool_result":
                labels.append(f"tool_result[{size_of(b.get('content'))}b]")
            elif t == "text":
                labels.append(f"text[{len(str(b.get('text','')).encode('utf-8','replace'))}b]")
            elif t == "thinking":
                labels.append(f"thinking[{len(str(b.get('thinking','')).encode('utf-8','replace'))}b]")
            else:
                labels.append(t)
    extra = []
    if r.get("isMeta"):
        extra.append("isMeta")
    if r.get("isSidechain"):
        extra.append("isSidechain")
    if r.get("subtype"):
        extra.append(f"subtype={r['subtype']}")
    print(f"{i:5d} {ts} {kind:10s} {model:16s} {stop:10s} "
          f"{' '.join(labels)[:90]} {' '.join(extra)}")
