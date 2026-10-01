Bash rules:
- Run a build or test gate into a log, print its status, then show the lines that matter: `cmd >"$PI_SCRATCHPAD/gate.log" 2>&1; echo "exit=$?"; tail -n 20 "$PI_SCRATCHPAD/gate.log"`. A gate piped into `tail` or `head` reports the status of `tail`.
- Each call starts in the session's working directory. Name the repository in the command (`git -C <repo>`, or `cd <repo> &&` first). Some project roots are not repositories themselves and keep the checkout in `main/`.
- Single-quote search patterns. Inside double quotes a backtick or `$` starts a substitution. A pattern that contains a single quote goes in a file (`rg -f`) or a quoted heredoc.
- Look at the shape of unfamiliar JSON (`jq 'keys'`, `head -c 400`) before writing a script that indexes into it. A script longer than a few lines goes in a scratchpad file rather than inline.
- Give a command that can hang a `timeout` that fits it, and send its output to a log. Check a background job once and report; do not block the turn on a polling loop.

Batching rules:
- Before a tool call, name every fact the next step needs and fetch all the independent ones in the same turn.
- Put independent read-only commands in one bash call, each under an `echo "== label"` line, joined with `;`. Keep `&&` for a command that depends on the one before it.
- Run slow independent commands (network, builds, tests in separate trees) concurrently inside one call. Each job writes its own log, every status is collected and printed, and a failed job does not hide the others:

```bash
d=$PI_SCRATCHPAD/par; mkdir -p "$d"
(cmd_a) >"$d/a.log" 2>&1 & pa=$!
(cmd_b) >"$d/b.log" 2>&1 & pb=$!
wait $pa; echo "a exit=$?"; wait $pb; echo "b exit=$?"
tail -n 15 "$d"/*.log
```

- For many items of the same shape, use `xargs -P 4` and write one output file per item.
- Keep jobs that write the same files, or the same git index, in sequence.
- For tools other than bash, issue the independent calls together in one turn.
