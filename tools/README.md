# Tools

The owned diagnostic CLIs, one directory each. The kit's `deployments.json`
names each tool's binary and build command; `bin/install` builds the ones
whose toolchain is on PATH and links them into `~/.local/bin`, and `bin/check`
verifies the links.

| Tool | What it does | Build |
|---|---|---|
| `sess` | Read Pi and Claude Code session transcripts (`stat`/`tools`/`tail`/`grep`) | `zig build` |
| `prefixdiff` | Find the byte where two request payloads diverge (the prompt-cache question) | `zig build` |
| `portaudit` | Map listening sockets to their systemd unit; `--audit` for the bind-127.0.0.1 policy | script |
| `introspect-scan` | Scan journals for skill invocations and wiki touches; the read side of the introspect sweep | script |

## Build output is not tracked

`zig-out/` and `.zig-cache/` are ignored. The PATH links
point into those build outputs, so a rebuild (`bin/install` again, or `zig
build` in the tool directory) is what deploys. `zig build test`
alone never reinstalls `zig-out/bin/*`, so after changing a tool, rebuild and
confirm the installed binary runs by name before trusting it.
