# Prompt library

Reusable prompt templates for pi. Every `.md` file here (except this README)
is exposed two ways:

- **Natively:** the kit's `package.json` manifest lists this directory under
  `pi.prompts`, so `review-staged.md` is the `/review-staged` command with
  autocomplete, arguments, and defaults (see pi's `docs/prompt-templates.md`).
- **Through the picker:** `/prompt` (the `extensions/prompt-picker` extension)
  opens a filterable list with a live preview and inserts the chosen
  template's body into the editor for review before sending.

## Format

```markdown
---
description: One line shown in autocomplete and the picker
argument-hint: "<required> [optional]"
---
The prompt text. $1, $@, and ${1:-default} are pi argument placeholders.
```

Both frontmatter keys are optional; without `description` the first body line
is used.

## Choosing an entry point

The picker inserts the raw body, so argument placeholders like `$1` arrive
literally for you to fill in by hand. Templates that lean on arguments are
smoother invoked natively (`/name arg1 arg2`), where pi expands the
placeholders on submit. Use the picker to browse; use `/name` when you know
what you want.

New templates and edits are picked up by `/reload` (native names) and
immediately by `/prompt` (it re-reads the directory each invocation).
