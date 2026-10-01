# ask-user-question

The `ask_user_question` tool: the model puts one or more structured questions
to the user and waits. Each question has two to four options, and a call may
carry any number of questions. Several questions get a tab each plus a Submit
tab that reviews the answers; a single question finishes on its first answer.

The tool is active only in pi's terminal UI. Print, JSON, and RPC runs never
see it, because they cannot draw the dialog.

## Dialog

Every question gets a `Type something.` row for a free-text answer, and a
multi-select question gets a `Next` row that commits the checked boxes. The
model may not author options named `Other`, `Type something.`, or `Next`.

| Key | Effect |
| --- | --- |
| `↑` / `↓` | Move between rows, wrapping. |
| `Enter` | Answer with the focused option. In a multi-select question it flips the box; `Next` commits. |
| `Space` | Flip the focused box (multi-select). |
| `Tab` / `Shift+Tab`, `→` / `←` | Next or previous question. |
| `n` | Write a note on the question, or on the Submit tab a note for the whole questionnaire. |
| `Shift+Enter` | Newline in a typed answer or note. |
| `Ctrl+U` | Clear the typed answer. |
| `Ctrl+G` | Edit the typed answer in `$VISUAL`, `$EDITOR`, or nvim. |
| `Ctrl+]` | Hide the dialog to read the transcript behind it, and bring it back. |
| `Esc` | Cancel the questionnaire, or close the note editor. |

The keys follow pi's keybindings (`tui.select.*`, `tui.input.*`), so a remapped
confirm or newline key applies here too.

A typed answer replaces a multi-select question's checkboxes. Enter on an
empty typed answer withdraws it. A note alone does not answer a question, and
Submit works with questions left unanswered.

When an option carries a `preview`, the focused option's preview renders as
markdown in a box: beside the options at 100 columns or more, under them
below that. A dialog taller than the terminal scrolls between its fixed top
and bottom.

## Result

The model gets one line per question, including the ones the user skipped:

```
User answers:
- "Which library should we use?" = "Zod"; user notes: prefer v4
- "Which checks do we need?" = "Unit, Lint"
- "Ship today?" = (not answered)
Note for the whole questionnaire: revisit after the migration
```

A cancelled questionnaire, or one submitted with nothing in it, returns
`User declined to answer questions`.

## Layout

- `index.ts`: tool registration, the schema and prompt text, and the rule
  that keeps the tool out of non-terminal runs.
- `lib.ts`: validation, the `Questionnaire` state machine, the result text,
  and the tab-bar and scroll arithmetic. No pi imports.
- `view.ts`: the dialog component. It draws a `Questionnaire` and turns keys
  into its transitions.
- `lib.test.ts`: unit tests. Run `node --test lib.test.ts` in this directory
  (Node 22.18+).

The prompt text the model sees (description, snippet, guidelines) is in
`index.ts`; edit it there.

## Provenance

A rewrite of `rpiv-ask-user-question` from
[juicesharp/rpiv-mono](https://github.com/juicesharp/rpiv-mono) (MIT), which
this replaces. The dialog's look and key set follow that package, and the
tab-bar windowing and cursor drawing are adapted from it (Copyright (c) 2026
juicesharp). Dropped:
localization, the RPC dialog fallback, the `rpiv:ask-user:*` events, the
config file, and the echo of the selected option's preview in the result.
