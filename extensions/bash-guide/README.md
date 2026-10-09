# bash-guide

Adds a `<bash>` section to pi's system prompt from `guide.md`. Needs pi
0.86 or later, where the prompt is built from named sections.

The guide has two groups of rules:

- **Bash rules** address the mistakes found in a census of 27,988 bash calls
  in the session logs (2026-06-25 to 2026-09-30): gate status lost in a pipe
  to `tail`, git run outside a repository, unbalanced quotes, inline scripts
  indexing JSON they had not looked at, and timeouts.
- **Batching rules** ask for what codemode's `Promise.allSettled` guideline
  asks for, using shell jobs: fetch independent facts in one turn, bundle
  read-only commands in one call, and run slow commands concurrently with
  every job's status printed.

The guide leaves out a rule about searches that exit 1 on no match. Those
make up the largest share of flagged bash errors, but
`~/.agents/wiki/platform/pi-bash-nonzero-exit-is-an-error.md` records the
decision to leave them alone: agents rarely retry them.

## Behaviour

- The section is present only while the `bash` tool is active.
- `guide.md` is read on every prompt, so an edit takes effect on the next
  one. On a model that accepts mid-conversation system messages the edit
  arrives as a patch of that one section.
- A custom prompt (`SYSTEM.md`, `--system-prompt`) or a forced one makes pi
  skip its sections, so the handler does nothing.
- The section costs about 2 KB on every request. The test fails if the guide
  grows past 3,000 characters.

`/sysprompt` (from prompt-sections) shows the section once the session has a
turn.

## Tests

```bash
node --test lib.test.ts
```
