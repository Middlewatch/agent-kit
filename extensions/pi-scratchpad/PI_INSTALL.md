# Installing pi-scratchpad

This directory loads through the kit's pi package
(`package.json` at the kit root lists `./extensions/pi-scratchpad/src/index.ts`), which the kit's
`bin/install` registers. The extension imports only Node built-ins and Pi's own types, so it needs no
`node_modules` at runtime, and the local `node_modules` here exists only for tests and typecheck.

## Global install

```bash
<kit>/bin/install
```

Every session then gets `$PI_SCRATCHPAD` in its bash environment. `/scratchpad` prints the path in a
TUI session. The sysprompt-editor extension's `{{PI_SCRATCHPAD}}` template placeholder renders
a system-prompt bullet naming the directory from the same variable.

## Configuration

| Variable | Default | Effect |
|---|---|---|
| `PI_SCRATCHPAD_BASE` | `${XDG_CACHE_HOME:-~/.cache}/pi-scratchpad` | Root of the scratch tree. Must be absolute. |
| `PI_SCRATCHPAD_TTL_DAYS` | `7` | Idle age at which a session directory is reaped. `0` disables sweeping. |

The base deliberately defaults to disk rather than `/tmp`, which is often tmpfs (RAM); see
`DESIGN.md`. Point `PI_SCRATCHPAD_BASE` at `/tmp/...` if you want the RAM-backed behavior anyway.

## Smoke test

Proof that the path reaches a real session:

```bash
rm -rf /tmp/sp-smoke /tmp/sp-base && mkdir -p /tmp/sp-smoke && cd /tmp/sp-smoke
PI_SCRATCHPAD_BASE=/tmp/sp-base pi -p --model haiku --thinking off \
  -e <kit>/extensions/pi-scratchpad/src/index.ts \
  'Use the bash tool once to run exactly: printf hello > "$PI_SCRATCHPAD/note.txt" && echo "$PI_SCRATCHPAD". Then reply with the path only.'
find /tmp/sp-base            # expect <base>/-tmp-sp-smoke/<session-uuid>/scratchpad/note.txt
```

To exercise the reaper in the same tree:

```bash
mkdir -p /tmp/sp-base/-tmp-old/dead/scratchpad
touch -d '30 days ago' /tmp/sp-base/-tmp-old/dead/scratchpad /tmp/sp-base/-tmp-old/dead
cd /tmp/sp-smoke && PI_SCRATCHPAD_BASE=/tmp/sp-base pi -p --model haiku --thinking off \
  -e <kit>/extensions/pi-scratchpad/src/index.ts 'Reply with the single word: ok'
find /tmp/sp-base            # the -tmp-old tree is gone; recent sessions survive
```

## Uninstall

Remove `./extensions/pi-scratchpad/src/index.ts` from the kit's `package.json`, or disable it in `pi config`.

Existing scratch directories are left alone. Delete the base by hand if you want the space back.
