# lemonade-hub-sync

Reconciles the Lemonade model catalog with the GGUF files actually present in
the HuggingFace hub cache on disk. Disk is the truth:

- **Adds**: a `.gguf` file in the hub that no registered model references gets
  registered as `user.<name>` via `POST /api/v1/models/register`
  (recipe `llamacpp`, labels `custom` + `autosync`, plus `vision` /
  `embeddings` / `reranking` / `reasoning` by evidence). One entry per file,
  so every downloaded quant is selectable. A repo's `mmproj*.gguf` is attached
  to its entries as the `mmproj` checkpoint rather than registered alone.
- **Removes**: a `user_models.json` entry whose checkpoint files have all
  disappeared from disk is dropped, with a timestamped `.bak-autosync-*`
  backup first. Entries with no checkpoint refs are left alone. The API's
  `/delete` is never used for this because it deletes files.
- **Refreshes loose GGUF trees**: when Lemonade has `extra_models_dir` set,
  each applied run creates and removes a hidden non-GGUF marker at that root.
  Lemonade 11.7 watches only the root, so nested downloads and deletions would
  otherwise stay stale. The event triggers its native recursive scanner.

No restart needed: the server persists registrations itself, re-reads
`user_models.json` on model lookup, and rescans `extra_models_dir` after the
refresh event. With the timer installed, loose-tree drift lasts at most ten
minutes.

## Usage

```bash
lemonade-hub-sync --dry-run     # show planned adds/removals, change nothing
lemonade-hub-sync               # apply
lemonade-hub-sync --install-timer   # user systemd timer: 2min after login, then every 10min
```

Flags: `--server` (default `$LEMONADE_URL` or `http://127.0.0.1:13305`),
`--hub` (default `$HF_HOME/hub` or `~/models/hub`), `--user-models`
(default `~/.cache/lemonade/user_models.json`).

Scope: GGUF / llamacpp only. safetensors-only repos (vLLM) are ignored; the
built-in catalog already handles the ones Lemonade supports.

## Tests

```bash
python3 tools/lemonade-hub-sync/tests/test_sync.py
```

Fixtures are synthetic hub trees in a temp dir; no server or network needed
for the pure-function tests.
