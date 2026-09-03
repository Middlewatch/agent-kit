---
name: glossary
description: "Build and sharpen a project's domain glossary in CONTEXT.md: Use when naming a new concept, when the owner and the code use different words for one thing, when a term turns out to be overloaded, or when writing docs or tests in a project or workspace. Update inline, not batched, create CONTEXT.md lazily if it does not exist."
---

# Glossary

`CONTEXT.md` at the repo root is the project's shared language: what each domain term
means and which synonyms are banned. Its value is that agents and docs stop spending
twenty words where the project already has one and that names in code, tests, and prose
stop drifting apart.

It is a glossary and nothing else.

## Format

```markdown
# <Project> glossary

**Episode**:
One recorded agent session from first user turn to close. The unit the
store addresses.
_Avoid_: session, conversation, transcript

**Lane**:
...
```

Rules: one or two sentences per term, defining what it is rather than what it does; be
opinionated, pick the best word and list the losers under `_Avoid_`; only project-specific
concepts (a timeout is not a term, a settlement window is); group under subheadings only
when real clusters emerge.

## Working discipline

- **Create lazily.** No `CONTEXT.md` exists until the first term is worth writing down.
- **Update inline, not batched.** The moment a term is settled in a grilling, spec, or
  review conversation, write it. A term deferred to a cleanup pass is a term lost.
- **Challenge collisions.** When the owner uses a word against its recorded definition,
  say so: "CONTEXT.md defines cancellation as X, you seem to mean Y, which is it?" When a
  word is overloaded (does "account" mean the customer or the login?), force the split and
  record both terms.
- **Cross-check the code.** When a stated definition contradicts what the code does,
  surface the contradiction rather than recording the wish.
- **Use it everywhere.** Test names, identifiers, spec prose, and commit messages use the
  recorded terms. A new module named after a concept the glossary lacks is the trigger to
  add the term.
- **Reference in AGENTS.md.** If the workspace contains an AGENTS.md file, ensure that
  CONTEXT.md is included as an inline reference to be read by any agent working within
  that workspace.
