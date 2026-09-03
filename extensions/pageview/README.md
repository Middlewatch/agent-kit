# pageview

Serves browser artifacts (HTML, SVG, PDF, and whatever assets they link) from the session cwd to a browser on another machine. Built for headless boxes where `xdg-open` has nowhere to go, for artifacts such as the `teach` skill's lessons, HTML design mockups mid-iteration, and generated diagrams.

An agent write of a `.html`, `.htm`, `.svg`, or `.pdf` file inside the workspace announces its URL automatically, once per file, both as a TUI notification and appended to the write tool's result so the agent can cite it. `/serve <path>` does the same on demand for anything else. The server binds the tailscale interface when one exists (discovered via `tailscale ip -4`, then an interface scan for the CGNAT range), and falls back to `127.0.0.1` for use through an SSH port-forward. Ports start at 8722 and increment when taken, so concurrent sessions coexist. The docroot is the session cwd; requests that escape it through `..` or symlinks get a 403, and `/serve` refuses paths outside the workspace. Everything shuts down with the session.

Served HTML carries an injected script that listens on an SSE endpoint (`/__pageview__/events`). The server watches every file it has served and pings reload on change, so an open tab refreshes within a second of an edit. The injection exists only in the HTTP response, and the disk file is untouched.

On a headless machine, an agent bash call that is exactly `xdg-open <file>` or `open <file>` on a workspace file gets rewritten into an `echo` of the served URL. On machines with a display the call runs untouched and opens locally.

This was built from the spec at `../../docs/specs/2026-08-21-pageview.md`.

## Tests

```
npx vitest run      # server module + bind discovery
npx tsc --noEmit
```

The pi event wiring is exercised by hand: `/reload`, then `/serve` a file, then open the URL from a tailnet device.
