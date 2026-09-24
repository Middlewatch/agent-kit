# sca source walkthrough (Zig 0.16)

## Checkpoint

- **Status:** active, updated 2026-09-18.
- **Goal:** read every file under `src/` in sca and explain its syntax and the decisions behind it.
- **Path:** follow `sca -s fixtures/log/tool-loop.jsonl -n` in data order: `main.zig`, `log.zig`, `messages.zig`, `span.zig`, then `config.zig` and `claude.zig`.
- **Last confirmed task:** exercise 2, user-run, correct prediction.
- **Difficulty:** shell plumbing (pipe, stdin vs argv) was the gap, not the Zig.
- **Deferred:** allocation tracking in depth, to be shown on `Log.load`/`deinit` and the test allocator in `log.zig`.
- **Next proposed task:** `log.zig`, starting at `Log.load`; show allocation tracking there.

## Setup

Zig 0.16.0, the sca checkout at commit `db4a7e3`. `zig build` installs `zig-out/bin/sca`. Every exercise reads source and runs the binary; nothing is written.

## Exercises

1. **`main.zig` lines 1-49: imports, `fail`, argument parsing.** Predict, then run `sca -n hello -m x` and `sca -m` and compare the two messages. Expected: `-n needs -s` for the first (after a word, `-m x` are prompt words), `-m needs a model` for the second. Outcome: user ran the first command and saw `-n needs -s`, which he had not predicted; the explanation is line 60, in the next chunk. Questions raised: purpose of `usage`, `\n`, `comptime`/`noreturn`/exit status, `main` shapes, optionals, `ArrayList` and `.empty`, allocation tracking, `_ =`, what `args` iterates.
2. **`main.zig` lines 50-93: buffered stdout, the `-s` branch, the claude transport, the line loop.** With `SCA_CLAUDE=$PWD/tests/fake-claude FAKE_FIXTURE=fixtures/text-turn.jsonl FAKE_LOG=/tmp/fake.log`, predict how many turns `printf 'hello\n\n   \nagain\n' | ./zig-out/bin/sca` runs, then check with `grep -c '"type":"user"' /tmp/fake.log`. Expected: 2 (blank and whitespace-only lines hit `continue`). Agent-checked: 2. Outcome: user predicted 2 and confirmed it, but could not say how the two prompts reached sca; needed the pipe and stdin explained (arguments vs stdin, one loop pass per line).
3. **`main.zig` lines 95-143: `printRequest`.** Run `sca -s fixtures/log/tool-loop.jsonl -n | md5sum` twice, then once more with a prompt word appended, and predict which hashes match. Then `git status --short fixtures/`. Expected: the first two match, the third differs only by an appended user message at the tail, and the fixture is unmodified (`.read_only`). Outcome: pending.
