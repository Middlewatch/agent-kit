# skill-inline

Expands `/skill:name [args]` on any line of a prompt, and more than one per
prompt. Pi's own expansion only fires when the prompt's first characters are
`/skill:`, which forces a skill to the top and allows one per turn. With this
extension a prompt can frame a skill with text before it, follow it with text
after it, and stack skills:

```
The README under docs/ is going public next week.
/skill:slopfix
Keep the CLI examples verbatim; only the prose changes.
/skill:public-release docs/
```

Each skill line becomes the same `<skill name=... location=...>` block pi
emits for a first-line invocation, in place, so the model sees one format
either way. Same-line arguments are appended after the block, as pi does.

## Rules

- A skill line is a line that starts with `/skill:`; a token mid-sentence is
  plain text.
- Lines inside a ``` or ~~~ fence are left alone.
- An unknown skill name stays in the prompt and raises a warning notification.
- A prompt with no skill lines passes through untouched.

## How it fits pi's pipeline

The handler runs on the `input` event, which fires before pi's own skill and
template expansion. When it rewrites the prompt, the text no longer starts
with `/skill:`, so pi's expansion step is a no-op; when it changes nothing it
returns `continue` and pi proceeds as before. Transforms chain, so other
`input` handlers still see and can rewrite the result.

The loaded skill set (including skills a pi package declares) is only
exposed to extensions on `before_agent_start`, which fires after input
expansion. The extension caches that list for the following prompts. For the
first prompt of a session it runs pi's `loadSkills` over the documented
roots itself: `~/.pi/agent/skills`, `.pi/skills`, `~/.agents/skills`, and
`.agents/skills` in the cwd and its ancestors up to the git root. A
package-declared skill has no directory root, so it is reachable inline from
the second prompt on; on the first, invoke it on the first line as before.

## Layout

- `index.ts`: event registration and skill lookup.
- `lib.ts`: pure line expansion, no pi imports.
- `lib.test.ts`: unit tests. Run `node --test lib.test.ts` in this directory
  (Node 22.18+).
