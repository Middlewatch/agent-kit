# Why the cache went cold on 2026-07-14

The prompt cache stopped hitting at 09:12. Nothing had shipped.

It took two days to find, and the cause was one byte. `prefixdiff` puts the
divergence at offset 4,193 of the request payload: the system block had gained
a trailing newline because a template got re-serialized through a different
writer. Everything after that byte is identical. The cache does not care:
prefix equality is byte equality, and byte 4,193 was enough to throw away
41,000 tokens of warm prefix on every turn.

What made this expensive to diagnose was that the symptom looked like a
provider-side regression. Latency went up, cost went up, and nothing in our
diff explained it, so the first day went into reading changelogs that were
never going to contain the answer. The lesson is not "check your newlines." It
is that a cache-hit-rate metric with no divergence-offset attached is a
smoke alarm without an address.

We now assert byte-identity of the static prefix in the harness. That catches
this class before it reaches a paid request, and it cost about forty lines.
The remaining exposure is the dynamic block, where we deliberately allow
variation and therefore cannot assert anything; if it drifts, we will find
out the same slow way.
