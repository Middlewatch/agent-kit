# portaudit

Checks every listening TCP and UDP socket against the service policy **bind
127.0.0.1, expose via `tailscale serve`**. `portaudit --audit` prints only the
listeners that violate it and exits 1, making the policy a one-command check.
It exists because a vite dev server once shipped bound to `*:5678`.

Plain `portaudit` lists every listener with its port, bind address, owning
user, PID, systemd unit, and command.

## Usage

```
portaudit [options] [port...]

  -a, --audit          only policy-violating listeners; exit 1 if any exist
      --allow <ports>  comma-separated port list (repeatable): waive these
                       ports' non-loopback binds from audit findings and the
                       exit code; plain output still shows them as `*`
      --allow-unit <units>
                       comma-separated systemd unit list (repeatable): waive
                       non-loopback binds owned by these units, same marker
                       and accounting as --allow
      --from <file>    classify recorded `ss -ltunpHe --cgroup` output
                       instead of reading live sockets
```

Positional port numbers filter the output (`portaudit 8080 30147`).

Row markers: ` ` loopback (fine), `~` tailnet address (tailscale serve itself
fronting a local service; excluded from audit findings), `*` non-loopback bind
waived via `--allow` or `--allow-unit`, `!` wildcard or other non-loopback bind
(audit finding).

Both allowlists are deliberate and flag-only (no config file): a waiver lives
in the command that grants it, so it stays visible in shell history and in
whatever doc pins the canonical invocation rather than hiding in a dotfile.
The audit summary reports how many findings the allowlist suppressed.
`--allow-unit` exists for services whose offending port is ephemeral and
changes every restart (a daemon's unconnected wildcard UDP client socket), which
a port allowlist structurally cannot cover. An unresolved unit renders as `-`,
and `-` never matches an allowlist entry.

```
$ portaudit --audit
  PORT   PROTO  ADDRESS                   USER    PID     UNIT                    COMM
! 22     tcp4   0.0.0.0                   root    -       sshd.service            -
! 22     tcp6   ::                        root    -       sshd.service            -
! 546    udp6   fe80::1                   root    -       NetworkManager.service  -
! 9090   tcp    *                         root    -       cockpit.socket          -
! 34536  udp4   0.0.0.0                   owner   355052  inferd.service          inferd
! 41641  udp4   0.0.0.0                   root    -       tailscaled.service      -
! 41641  udp6   ::                        root    -       tailscaled.service      -

7 listener(s) bound beyond loopback — policy is bind 127.0.0.1 + tailscale serve
$ portaudit --audit --allow 22,41641,546,9090 --allow-unit inferd.service
no non-loopback listeners (7 finding(s) suppressed by allowlist)
```

Exit codes: 0 clean, 1 audit findings, 2 usage/IO error.

The audit fails closed: if `ss` is missing or fails to enumerate sockets,
`portaudit` exits 2 with a `portaudit:`-prefixed error rather than reporting a
clean audit.

## Reading notes

- The data source is `ss -ltunpHe --cgroup` (iproute2). The cgroup is a socket
  attribute the kernel reports over SOCK_DIAG, so the unit resolves for every
  socket, including root-owned daemons, without sudo. PID and COMM still only
  appear for same-user processes (that part needs `sudo`), but the unit is the
  column that matters for attribution, and it is always there.
- Tailnet classification is by address range (100.64.0.0/10 and Tailscale's
  fixed ULA prefix `fd7a:115c:a1e0::/48`). A rogue service binding the tailnet
  IP directly would also class `~`; the UNIT column distinguishes it from
  tailscaled.
- `ss` renders a dual-stack wildcard as `*` rather than `::`, so such rows show
  PROTO `tcp`/`udp` with no 4/6 suffix. That is the more accurate description,
  since the raw row carries `v6only:0`.
- Wildcard UDP is common and legitimate for discovery protocols (syncthing,
  LLMNR, tailscale's WireGuard port); that is what `--allow` is for, or
  `--allow-unit` when the port is ephemeral.

## Verification

```
./tests/run.sh
```

46 assertions. Classification is exercised against recorded `ss` output
(`tests/fixtures/synthetic.txt`) so it does not depend on what this host
happens to be listening on: loopback/tailnet/wildcard/link-local/LAN classes
for v4 and v6, the family-agnostic `*` wildcard, innermost-unit extraction from
a nested cgroup path, slice-only cgroups and absent cgroups yielding `-`,
absent `uid:` meaning root, uid→name resolution, port and unit allowlists
including that `-` never matches, repeated flags accumulating, waived rows
staying visible as `*` in plain output, the positional port filter, sorting,
usage errors, and the fail-closed path. `tests/fixtures/live-*.txt` is a
real capture kept as a format-drift canary.

**Oracle comparison, 2026-08-06.** `portaudit` was differentially verified
against `ports`, the Zig tool it replaces, on 58 live listeners across five
allowlist configurations (none, canonical, ports-only, units-only,
over-broad). Exit codes matched in all five; the finding sets were identical in
all five. The only rendering difference was cockpit's dual-stack 9090 socket
(`tcp6 ::` vs `tcp *`), where the `ss` reading is the more accurate one.

## Why this replaces `ports`

`ports` read `/proc/net/{tcp,udp}{,6}` directly and mapped socket→process by
scanning `/proc/<pid>/fd` for the inode, which the kernel only permits for
your own processes. On one workstation it resolved a unit for 12 of 58 listeners;
`ss --cgroup` resolved 58 of 58 without sudo, because it asks the kernel
for the socket's cgroup instead of inferring ownership. Every root daemon
(`sshd`, `tailscaled`, `cockpit`, `NetworkManager`, `systemd-resolved`) was a
`-` under `ports` and is named here.

The cost of the swap is that this parses another tool's human-readable output
rather than owning its parse of a kernel ABI. That fragility is bounded: an
`ss` format change would misalign columns loudly rather than silently, and
`tests/fixtures/live-*.txt` plus the live assertions in the suite are
there to catch it.

## Install

The kit's `bin/install` links `~/.local/bin/portaudit` at the script; there is
no build step, so an edit is live immediately.

Requires `bash`, `awk`, and `ss` (iproute2). No build step.
