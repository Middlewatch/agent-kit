# prompt-picker

`/prompt` opens a filterable picker over the kit's prompt library
(`prompts/` at the kit root) and inserts the chosen template's body into the
editor, ready to review, fill in, and send.

## Usage

- `/prompt`: opens the picker. Type to filter by name (prefix match), arrows
  to move, enter to insert, esc to cancel. A live preview of the selected
  template's body renders under the list.
- `/prompt rev`: opens the picker pre-filtered. The argument also
  autocompletes against template names.

The same library loads natively through the kit manifest's `pi.prompts`
entry, so each file is also its own `/name` command with pi's argument
expansion. The picker is for browsing, and `/name args` serves templates that
take arguments, since the picker inserts placeholders like `$1` literally.

## Layout

- `index.ts`: command registration and the TUI picker (a SelectList with
  filter and preview, falling back to `ctx.ui.select` in non-TUI modes that
  still have UI, such as RPC).
- `lib.ts`: pure directory scan and frontmatter parsing, with no pi imports.
- `lib.test.ts`: unit tests. Run `node --test lib.test.ts` in this
  directory (Node 22.18+).

The library location is resolved relative to this file (`../../prompts`), so
the extension works wherever the kit checkout lives. Templates are re-read on
every `/prompt` invocation; native `/name` commands refresh on `/reload`.
