# pi-config

`/config` opens pi's resource picker inside the session: every discovered
extension, skill, prompt template, and theme, grouped by package and
directory the way `pi config` groups them, with a checkbox per item. Closing
the picker after a change runs `/reload`, so the loop is one command instead
of leaving pi, running `pi config`, and reloading by hand.

## Usage

- `/config`: opens the picker in global scope (`~/.pi/agent/settings.json`).
- Arrows and page keys move. Space or enter toggles. Typing filters by name,
  type, or path, and backspace edits the filter. Esc closes.
- Tab switches to project scope (`.pi/settings.json`), available once the
  project is trusted (`/trust`). Project items are read-only in global scope.

Project scope is a tri-state override over the global result: `[x]`/`[ ]`
dimmed means inherited, `[+]` forces load, `[-]` forces unload, and each
toggle steps to the next state that differs from the inherited one.

## What it writes

It writes the same shapes `pi config` writes, so either tool can undo the
other's work:

- Top-level resources: `+pattern` / `-pattern` entries in the scope's
  `extensions`, `skills`, `prompts`, or `themes` array, relative to the
  resource's base directory (an inherited global item pinned from project
  scope uses its absolute path).
- Package resources: the package's object form with the pattern relative to
  the package root. A project override of a global package is added as
  `{ source, autoload: false, ... }` and removed again when it empties.

Resource types are the four pi discovers (`RESOURCE_TYPES` in `lib.ts`).
Adding one when pi adds one is a table row.

Disabling this extension, the kit package, or `pi-interlock` is possible
here, exactly as it is from `pi config`. The reload that follows unloads
them.

## Layout

- `index.ts`: command registration, resolution through pi's
  `DefaultPackageManager` for both scopes, a `SettingsManager` adapter, and
  the `ctx.ui.custom` renderer. Non-TUI modes get a pointer to `pi config`.
- `lib.ts`: the pure model (grouping, filtering, selection, and the settings
  edits behind each toggle) against a `SettingsPort` interface. It ports the
  semantics of pi 0.84.4's internal `ConfigSelectorComponent`, which pi does
  not export.
- `lib.test.ts`: the write shapes above as literal expectations over an
  in-memory port. Run `node --test lib.test.ts` here (Node 22.18+).
