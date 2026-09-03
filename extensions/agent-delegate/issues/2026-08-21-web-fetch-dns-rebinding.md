# Known limitation: web_fetch does not resolve DNS before its host guard

**Filed:** 2026-08-21, from the second review pass of the loaded extension.

**Status:** Documented, not scheduled. The owner asked to record the residual
rather than rework the guard now.

## What the guard does

`assertFetchableUrl` (`src/web.ts`) runs on the initial URL and on every
redirect hop. It refuses `localhost`-style names and literal loopback,
private (RFC1918), and link-local addresses, including the cloud-metadata
`169.254.0.0/16` range and IPv6 loopback/unique-local/link-local and
v4-mapped forms.

## The residual

The check reads only the URL's textual hostname; actual DNS resolution happens
later inside `fetch`. A public hostname that resolves to a loopback, RFC1918, or
metadata address therefore passes the guard and is fetched, which is classic
DNS-rebinding SSRF. This only matters for the `research` profile,
the sole web-capable path (scoped or scopeless), and only when the child is pointed at an
attacker-influenced hostname or one whose page redirects to such a name.

## Mitigation in place

The README no longer claims private hosts are unconditionally refused: it states
the guard blocks literal private/loopback addresses and `localhost`-style names,
does not DNS-resolve, and that a scopeless research child should be pointed only
at trusted targets.

## The fix, if it is ever warranted

Resolve every A/AAAA record at each hop, reject the request if any resolved
address is private/loopback/link-local, then pin the validated address for the
actual connection so a rebind between check and connect cannot occur. This is
real work (custom lookup plus connection pinning across redirects) and is
deferred until a threat model needs it.
