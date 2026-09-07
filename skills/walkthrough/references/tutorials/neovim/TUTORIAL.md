# Neovim walkthrough

## Checkpoint

- Status: paused after the edit, navigate, inspect, and run workflow on 2026-09-07.
- Last confirmed task: exercise 32, running the disposable Lua file from the configured terminal and returning to the editor.
- Pending: exercise 33, inspecting configuration organization. The learner answered the friction question but did not confirm inspecting the file.
- Practice needs: editing, navigation, remembering controls, and ownership of a configuration assembled by someone else. The learner completed a macro-based challenge after several attempts; later discussion identified a simpler search-and-dot approach.
- Deferred: audit and update the F12 keyboard reference against active mappings. It was not audited during this walkthrough.
- Resume: confirm the visible editor and practice state, then give one changed-target edit without its key recipe. Use the result to choose further practice before returning to configuration inspection.
- Next proposed ownership task: let the learner make one small configuration change, explain the relevant Lua, and verify its effect. No such change was made here.
- Evidence: [redacted session log](SESSION.md), session `01a07a1c-52b3-75be-b3c8-d0cf3de92bce`. Outcomes below are historical confirmations, not delayed-retention measurements.

## Setup

The run used Neovim 0.12.5 and Neovide 0.16.2. Exercises 1–16 used clean Neovim after a GUI launch correction. Later exercises used a pre-existing configuration and installed plugins. Confirm versions and mappings on another machine; these records do not install that configuration.

For a fresh replay, set `TUTORIAL_DIR` to this tutorial's directory. Copy the bundled samples into a new disposable directory:

```bash
PRACTICE=$(mktemp -d "${TMPDIR:-/tmp}/neovim-walkthrough.XXXXXX")
cp -R "$TUTORIAL_DIR/practice/." "$PRACTICE/"
git -C "$PRACTICE" init -q
printf 'Practice directory: %s\n' "$PRACTICE"
cd "$PRACTICE"
neovide editing.txt -- --clean '+set number relativenumber'
```

The nested Git repository has no remote and keeps project searches scoped. The practice samples are fresh starting text, not the paused learner's edited files. Store an existing practice path in local workspace notes; temporary directories may be cleaned by the system.

For terminal Neovim, use `nvim --clean '+set number relativenumber' editing.txt`. The GUI correction in this run was to put `editing.txt` before Neovide's `--`; a filename after it produced an empty window despite a passing headless check.

Confirm that `editing.txt` opens with `status = draft` before starting. All key sequences start in Normal mode unless stated otherwise. `Esc` returns from Insert mode; `:w` followed by Enter saves, and `:q` closes the current window. Colon commands and searches below require Enter. Other letters are successive keystrokes, not simultaneous chords.

Normal startup can install missing plugins or language tools automatically. Inspect the existing setup before exercise 17; handle missing dependencies as a separate owner-approved change and remain in clean mode until then.

## Exercises

### 1. Feel modes and undo

Press `i`, type `hello `, press `Esc`, then `u` and `Ctrl+r`. Check that text entry, undo, and redo differ from Normal-mode commands.

Outcome: the learner confirmed key behavior, but the intended practice document had not yet been established.

### 2. Recover the starting document

The learner reported an empty or dashboard view and asked whether a starting document was missing. An explicit `:edit` retry preceded the corrected GUI launch shown in Setup.

Outcome: the learner confirmed the intended document after the launch correction. The GUI result supersedes the earlier headless startup check.

### 3. Change an inner word

Search `/draft`, type `ciw`, enter `ready`, and press `Esc`. Expected: `status = ready`.

Outcome: user-confirmed guided completion. `c` changes the target; `iw` is the inner word.

### 4. Change or delete inside quotes

Search `/Old`, type `ci"`, enter `Workshop plan`, then `Esc`. Expected: the title changes while retaining quotes.

Outcome: user-confirmed. The learner also correctly interpreted `di"` as deleting inside quotes. Deletion stays in Normal mode; changing enters Insert mode.

### 5. Search and repeat an edit

Search `/slow`, enter `ciwfast`, then `Esc`. Use `n.` twice to change the other matches without typing the replacement again.

Outcome: the learner confirmed all three replacements. `n` repeats a search; `.` repeats the last edit.

### 6. Find a character within a line

On `paint(red, green, blue)`, try `0f,`, then `;`, then `,`. Compare `0t,`, which stops before the comma. Goal-only variation: land on `(`.

Outcome: user-confirmed. The learner asked about `;` and `,`; the discussion distinguished inherited vi convention from an unverified explanation of its original design rationale.

### 7. Compose an operator and a motion

Search `/paint`, type `0f(l`, then `ct,`, enter `orange`, and press `Esc`. Goal: change the next color to `purple` without the full sequence supplied.

Outcome: the learner reported using `0`, `f` followed by Space, `l`, and `ct,` to change `green`. That method worked for the line's actual spacing.

### 8. Move and copy whole lines

Search `/^move this`, then use `ddp`. Search `/copy this`, then use `yyp`.

Outcome: the learner confirmed the line move and duplicate. Doubled operators target a whole line; `p` puts linewise text below the current line.

### 9. Select whole lines visually

Search `/^name = alpha`, press `V`, `jj`, then `>`. Undo with `u`.

Outcome: the learner confirmed selection expansion and indentation, and reported that the exercise clarified Visual mode.

### 10. Select a text object before changing it

Search `/Workshop`, type `vi"`, then `c`, enter `Site plan`, and press `Esc`.

Outcome: user-confirmed. Visual selection exposes the target first; `ci"` composes the same target and change directly.

### 11. Insert a rectangular prefix

Search `/^name = alpha`, press `0`, `Ctrl+v`, `jj`, `I`, type `export `, then `Esc`.

Outcome: the learner confirmed the prefix on all three lines. The additional insertions appear when leaving Insert mode. A terminal may intercept `Ctrl+v`; verify the interface in use.

### 12. Record and replay a macro

Search `/^bracket alpha`, then record with `qq`. Enter `0w`, `i[`, `Esc`, `A]`, `Esc`, and `j0`. Stop with `q`; replay with `@q` twice.

Outcome: user-confirmed bracketed values on the three lines. The macro includes navigation to the next line; dot-repeat alone records one change.

### 13. Complete an editing challenge with fewer hints

Goal: change the quoted owner to `Site lead`, replace all three `stale` values with `current` while typing the replacement once, remove the temporary-note line, and save.

Outcome: the learner reported using `ci"`, a macro, and `/rem` followed by `dd`. The macro took several attempts. Final file contents were not independently inspected in that conversation.

### 14. Review the macro boundary

The reported sequence placed cursor reset and line advance outside the recording. That made replay depend on the position supplied between attempts; the exact omitted keystrokes remain unknown.

For this task, rehearse `/stale`, `ciwcurrent`, `Esc`, then `n.` twice. If recording a line-by-line macro instead, include its starting-position reset and next-line movement inside the recording.

Outcome: the learner agreed that dot-repeat was simpler for this repeated single edit. No additional independent challenge result was recorded.

### 15. Use built-in buffers

Save, then run `:edit project.txt`, `:edit notes/review.txt`, `:ls`, and `:buffer editing.txt`.

Outcome: user-confirmed file opening and return. A buffer is the in-memory file representation; changing buffers does not discard it.

### 16. Use built-in splits

Run `:edit project.txt`, then `:vsplit notes/review.txt`. Switch with `Ctrl+w l` and `Ctrl+w h`; close one window with `Ctrl+w q`.

Outcome: user-confirmed switching and closing. A window displays a buffer, so closing a window does not delete the file.

### 17. Enter the configured editor

After checking startup dependencies, save and close the clean session with `:wqa`. From the practice directory, launch `neovide editing.txt` without `--clean`.

Outcome: subsequent configured exercises worked. The agent reported dependencies already installed at that time; repeat the check before relying on normal startup elsewhere.

### 18. Find a file by name

Press `Space f f`, type `review`, then Enter.

Outcome: the learner confirmed opening `notes/review.txt`. This is a configured Telescope mapping, not a core Neovim shortcut.

### 19. Search project contents

Press `Space s s`, type `delivery window`, select a `project.txt` result with `Ctrl+j` or `Ctrl+k`, then Enter.

Outcome: the learner confirmed matches in both sample files and opening the chosen result. A later context loss was corrected by recovering this checkpoint from the log.

### 20. Choose an open buffer

Press `Space b b`, type `editing`, and Enter. Repeat to return to `project.txt`.

Outcome: user-confirmed. The file picker searches disk; the buffer picker chooses among already-open files.

### 21. Pin a working set with Harpoon

Use `Space h a` on two files, inspect the list with `Space h h`, then test `Space h 1` and `Space h 2`. Check existing slots before assuming which file occupies each one.

Outcome: the learner confirmed the list and direct jumps. Pins are deliberate working-set choices rather than every buffer opened.

### 22. Jump to visible text with Flash

Return to the editing file, press `s`, type enough target letters to show a label, then press that label.

Outcome: user-confirmed. Flash's configured `s` mapping replaces core substitute-character behavior. `/` remains useful beyond the visible screen and for search-plus-dot editing.

### 23. Change surrounding delimiters

Inside the quoted title, use `cs"'` to change double quotes to single quotes, then `ds'` to remove the quotes.

Outcome: user-confirmed nvim-surround behavior. Deleting delimiters differs from `di"`, which deletes their contents.

### 24. Discover configured shortcuts

Press Space and pause for Which-key, then enter `h`. Use `Space s k` and search `Harpoon` to inspect mappings.

Outcome: both discovery routes were confirmed. F12 was mentioned as a separate reference sidebar; its contents were not checked, and its audit remains deferred.

### 25. Return through jump history

Search `/FINAL CHALLENGE`, press `gg`, then test `Ctrl+o` and `Ctrl+i`. Inspect `:jumps` if the destinations are surprising.

Outcome: user-confirmed. Cross-session destinations prompted an explanation of ShaDa's saved paths and cursor positions.

### 26. Follow a language-aware definition

The original exercise opened a local configuration module read-only, searched for a call to `valid_window`, placed the cursor on its name, then used `gd` and `Ctrl+o`.

Outcome: the learner confirmed the definition jump and return. For replay, choose an existing function call in a local file with an attached language server; the original private module is not bundled here.

### 27. Inspect hover and references

On that symbol, use `K`, then `gr`. Choose a reference using `j` or `k` and Enter; `:cclose` closes a quickfix list when needed.

Outcome: user-confirmed popup and reference list. These results depend on language-server attachment and the active mappings.

### 28. Rename a symbol semantically

Open the fresh `rename.lua` sample. Search `/line_total`, press `Space c r`, then `Ctrl+w` to remove the old name in the IncRename prompt. Enter `calculate_total` and submit.

Outcome: the learner confirmed the definition and both calls changed while the string `"line_total"` stayed unchanged. This distinguishes a symbol rename from textual replacement.

### 29. Observe a diagnostic and undo it

Search `/12`, replace the inner word with `"twelve"` using `ciw`, and leave Insert mode. Inspect the type warning with `Space c d`, dismiss it, then undo with `u`.

Outcome: the warning appeared and cleared. Static diagnostics do not replace executing tests.

### 30. Format a buffer

Search `/return quantity`, replace the line with a badly spaced equivalent expression, then press `Space c f`.

Outcome: the learner confirmed repaired spacing. The configured Conform formatter used StyLua for Lua; inspect `:ConformInfo` on a different setup.

### 31. Select a completion

At the end of `rename.lua`, use `G`, `o`, and type `print(mat`. Select `materials` with Tab, accept with Enter, finish the expression, and leave Insert mode. Remove the temporary line with `dd`.

Outcome: user-confirmed. This blink.cmp setup leaves nothing initially selected, so Enter is a newline until a completion is explicitly selected.

### 32. Run from the integrated terminal

Save and press `Space t t`. Confirm the practice directory with `pwd`, then run:

```bash
nvim --clean --headless -l rename.lua
```

Expected output: `231 line_total`. Press Escape twice quickly, then `q` to leave terminal input and hide this configured terminal.

Outcome: the learner confirmed the output and return to the editor. These terminal keys are configuration-specific.

### 33. Inspect configuration organization

Assigned: open `:view ~/.config/nvim/init.lua` and inspect the modules for options, keymaps, autocommands, and plugins.

Outcome: pending. The learner described difficulty with editing, navigation, and remembering keys rather than confirming inspection. Suggested practice websites and a future configuration change were not completed exercises.

## Practice state at pause

The Lua sample had its function renamed and its temporary error and completion line removed. The learner reported the expected run output. The final editing challenge was reported complete with macro friction, but its complete file contents were not checked.

Configured buffer, Harpoon, window, and cursor state are local and may have changed. Confirm them before resuming. The bundled samples restore the original exercise inputs; they do not recreate the historical live configuration or claim to preserve unsaved buffers.
