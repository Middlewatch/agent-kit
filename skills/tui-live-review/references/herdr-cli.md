# herdr CLI runbook

**Compatibility: verified against herdr 0.7.5, protocol 17.** A herdr upgrade
invalidates this runbook rather than the skill. Re-verify each rule against
the new version and update this header before trusting it again.

- Where a subcommand takes a positional pane id (`read`, `get`,
  `wait-output`, `run`, `send-keys`, `send-text`, `close`, `split`),
  options come after it: `herdr pane read w8:p3 --source visible`.
  Options before the id fail with "unknown option". `process-info`,
  `layout`, and `list` take no positional id, so use `--pane <id>`.
  Use space-separated values rather than `--opt=value`.
- `pane run` types the command into the pane's shell (it does not exec
  it), and shell quoting in your arguments is lost in transit. Write the
  launch into a wrapper script and run it by path (`scripts/spawn.sh`)
  rather than passing a compound command to `pane run`.
- Because the typed command echoes into the pane, `wait-output` can
  match your own command line instead of program output. Wrapper scripts
  eliminate this. If you must wait on ad-hoc text, use a marker the
  command string cannot contain.
- `pane read` / `wait-output` sources (both default to `recent` when
  `--source` is omitted): `visible` (rendered screen, exactly viewport
  rows), `recent` (trailing window, with `--lines N` reaching further
  into scrollback), `recent-unwrapped` (wrap-joined), and `detection`.
  `--raw` keeps ANSI bytes. The `revision` field in pane responses does
  not track output, so detect change by content, as `record.sh` does.
