# Yazi walkthrough

## Checkpoint

- Status: paused, 2026-09-07.
- Goal: navigate, preview, and organize files from the terminal, then open a file in an editor and return.
- Last confirmed task: exercise 22, a goal-only folder creation, copy, and rename challenge. The learner reported no lookup; file checks verified the result and preserved originals.
- Practice needs: the learner identified `h`, `j`, `k`, and `l` muscle memory as the main difficulty. Navigation rehearsals helped within this session. Delayed retention has not been checked.
- Next proposed task: confirm the visible starting state, then ask the learner to reach `handoff`, preview `supplies.txt`, and return without a key recipe. Record prompting or lookup before choosing new material. Browsing a real project is a later transfer task.
- Deferred issues: none for Yazi. The owner adopted the reminder-spacing and retention recommendations after this pause.
- Provenance: session `01a07d4c-4907-75be-b3c8-d0d1805147e7`, 2026-09-07. Exercises below reconstruct the conversation and its file checks rather than a prescribed course.

## Setup

This run used Yazi 26.5.6 with its default keymap. Text files opened in Neovim through this existing opener:

```toml
[opener]
edit = [
    { run = "nvim -- %s", block = true, desc = "Neovim", for = "unix" },
]
```

This is an environment assumption, not a configuration change to apply automatically. Recursive searches used installed `fd` and `rg`. Check the local version with `yazi --version` and bindings with `F1` before replaying on another installation.

### Resume existing practice

Set `PRACTICE` to the local practice directory recorded in the workspace notes, then run:

```bash
yazi "$PRACTICE"
```

Compare its files with the practice state at the end of this document. A fresh Yazi process does not restore the tabs or cursor position from this session.

### Start a fresh replay

These commands create new disposable materials without replacing earlier practice:

```bash
PRACTICE=$(mktemp -d "${TMPDIR:-/tmp}/yazi-walkthrough.XXXXXX")
mkdir "$PRACTICE/inbox" "$PRACTICE/archive"
printf 'Yazi practice\n\nThese files are disposable.\nStart by exploring inbox and previewing its notes.\n' > "$PRACTICE/start.txt"
printf 'Shopping list\n\nCoffee\nBread\nApples\n' > "$PRACTICE/inbox/shopping.txt"
printf 'Project notes\n\nReview the drawing revisions.\nConfirm the delivery date.\n' > "$PRACTICE/inbox/project-notes.txt"
printf 'Practice directory: %s\n' "$PRACTICE"
yazi "$PRACTICE"
```

Record that path locally if you want to resume it. Temporary directories may be cleaned by the system. Fresh materials begin at exercise 1, not at the paused checkpoint.

## Exercises

All keys below apply in Yazi's file view unless an editor, input prompt, or help view is named. Lowercase and uppercase keys differ; `tt` means two successive presses. The exercise outcomes describe this run, not future replay results.

### 1. Open the practice folder

Launch Yazi using the setup instructions. The middle pane should contain `archive`, `inbox`, and `start.txt`. The left pane shows the parent folder; the right pane previews the highlighted item. Press lowercase `q` to quit when needed.

Outcome: the learner confirmed the expected starting view.

### 2. Navigate and preview

Use `j` to move down and `k` to move up. Highlight `inbox`, press `l` to enter it, then highlight `shopping.txt`. Its preview should contain Coffee, Bread, and Apples. Highlighting previews the file without opening an editor.

Outcome: user-confirmed with exact instructions.

### 3. Return to the parent folder

Goal: return to the practice folder and preview `start.txt`. The supplied hint was `h` for the parent folder. Check the last line of the preview.

Outcome: the learner correctly reported `Start by exploring inbox and previewing its notes.`

### 4. Copy one file

From `inbox`, highlight `shopping.txt` and press `y` to yank for copying. Press `h`, enter `archive`, and press `p` to paste. With no multi-file selection, Yazi acts on the highlighted file.

Check: the file exists in both folders. Outcome: user-confirmed; agent checks found matching source and destination contents.

### 5. Move one file

Goal: move `inbox/project-notes.txt` into `archive`, choosing the navigation yourself. Use `x` instead of `y`, then `p` at the destination. Cutting marks the file; pasting performs the move.

Check: the destination exists and the source is absent. Outcome: user-confirmed; subsequent file inspection agreed.

### 6. Rename a file

In `archive`, highlight `project-notes.txt` and press `r`. The cursor sits before `.txt`. Type `-reviewed` and press `Enter`. To cancel the rename prompt, press `Esc` to leave editing mode, then `Esc` again to close it.

Check: the name is `project-notes-reviewed.txt`. Outcome: user-confirmed and later agent-checked.

### 7. Copy a selection

In `archive`, highlight `project-notes-reviewed.txt` and press `Space`. This toggles selection and advances the highlight. With `shopping.txt` highlighted, press `Space` again. Press `y`, return to the practice root with `h`, then press `p`.

The highlight is the cursor; the selection is the set an operation affects. `Esc` clears a selection before an operation.

Check: both copied files appear beside `start.txt`. Outcome: user-confirmed and agent-checked.

### 8. Create a directory and organize the copies

At the practice root, press `a`, type `working/`, and press `Enter`. A trailing `/` creates a directory; without it, `a` creates a file.

Goal: move the two files beside `start.txt` into `working`, preserving `start.txt` and the contents of `archive`.

Outcome: the learner reported success, but a later check found files at both source and destination. The move was not established. The intervening keystrokes were not observed; exercise 16 addressed the remaining source copies. On a clean replay, verify source absence here and skip that corrective exercise if no extra copies remain.

### 9. Rehearse navigation with a map

From `working`, follow this route with the key map visible:

```text
          k = up
h = parent       l = enter
          j = down
```

Press `h`, highlight `inbox` with `j` or `k`, and enter with `l`. Repeat the parent-and-enter pattern to visit `archive`, then return to `working`. Check that its two files appear in the middle pane.

Outcome: user-confirmed guided rehearsal. This responded to the learner's stated difficulty recalling the movement keys.

### 10. Repeat navigation with fewer cues

Goal: take the route `working` → `archive` → `inbox` → `working`. Preview a text file at each stop. Try recalling the movement key before consulting the earlier map.

Outcome: the learner reported understanding the keys and identified muscle memory as the remaining practice need. No delayed check occurred.

### 11. Edit and return

In `working`, highlight `project-notes-reviewed.txt` and press `Enter`. In Neovim, press `G`, then lowercase `o`, and type `Ready for review.` Press `Esc`, type `:wq`, and press `Enter`.

Check: Neovim closes and Yazi's preview shows the new line. Outcome: user-confirmed return to Yazi; an agent file read verified the saved line. The configured blocking opener lets Yazi wait for the editor.

### 12. Find a name in the current folder

In `working`, press `/`, type `shop`, and press `Enter`. `shopping.txt` should become highlighted while both files remain listed. `n` moves to the next matching name; `N` moves to the previous one. Those repeat keys were explained but not separately exercised.

Outcome: user-confirmed filename lookup. `/` does not search file contents or descend into subfolders.

### 13. Filter the current folder

Press `Esc` to clear the find highlighting. Press `f`, type `shop`, and press `Enter`. Only `shopping.txt` should remain visible. Filtering hides nonmatching entries without deleting them.

Outcome: user-confirmed filtered view.

### 14. Clear a filter and recall filename lookup

Press `f`, then `Ctrl+u` to clear the filter text, and `Enter`. Both files should reappear.

Goal: highlight `project-notes-reviewed.txt` by part of its name while leaving both files visible. Outcome: the learner correctly identified `/` as the lookup key.

### 15. Inspect the earlier move result

After an agent check found extra source copies from exercise 8, press `h` to inspect the practice root. Compare the files beside `start.txt` with those in `working`.

Outcome: the learner confirmed the extra source files. Destination presence alone had not verified the earlier move.

### 16. Retry a move with an empty destination

This correction applies only when the extra source files from exercise 15 exist. At the practice root, create `spare-copies/` with `a`. Press `Esc` to clear selection, then select only the two text files beside `start.txt` using `Space`. Press `x`, enter `spare-copies`, and press `p`.

Check both arrival in `spare-copies` and absence from the source folder. Outcome: user-confirmed; agent inspection found both moved files and only `start.txt` at the root. An empty destination avoided overwriting the edited notes in `working`.

### 17. Search names across subfolders

From the practice root, press lowercase `s`, type `reviewed`, and press `Enter`. This uses `fd` to search names recursively. Press `Esc` to leave the results.

Outcome: the learner confirmed matches under `archive`, `spare-copies`, and `working`. A clean replay that did not need exercise 16 will have two matches instead of three.

### 18. Search file contents

Return from the previous results to the practice root with `Esc`. Press uppercase `S`, type `Ready for review`, and press `Enter`. This uses `rg` to search contents rather than names.

Outcome: the learner confirmed only `working/project-notes-reviewed.txt` matched at this point. Later copies of that edited file also contain the line, so repeating the search after exercise 22 gives more results.

### 19. Look up a shortcut in help

Press `Esc` to leave the search results, then `F1` to open help. Press `f`, type `tab`, and press `Enter`. Find the row `Create a new tab in CWD`, where CWD means current working directory.

Outcome: the learner identified `tt`. Help uses its own filter; `Esc` clears it, then another `Esc` closes help.

### 20. Keep two folders open in tabs

After closing help, enter `inbox`. Press `tt` to create a second tab there. In the new tab, use `h` and enter `working`. Press `1` to visit the first tab and `2` to return to the second.

Check: tab 1 shows `inbox` and tab 2 shows `working`. Outcome: user-confirmed. Each tab maintains its own location.

### 21. Copy across tabs

Goal: copy `project-notes-reviewed.txt` from `working` into `inbox` using the two tabs, without folder navigation. Yazi carries yanked files across tabs; combine the copy recipe from exercise 4 with the tab keys from exercise 20.

Check: the original remains in `working`, and the copy in `inbox` includes `Ready for review.` Outcome: user-confirmed; agent comparison found identical contents.

### 22. Combine workflows without a key recipe

Goal: create `handoff` beside `inbox`, copy both files from `working` into it, and rename the copied `shopping.txt` to `supplies.txt`. Leave both originals unchanged. Choose tabs or folder navigation.

Check:

```text
handoff/
├── project-notes-reviewed.txt
└── supplies.txt
```

Outcome: the learner reported completion with no lookup. Agent checks verified both filenames, matching copied contents, and the originals in `working`. The chosen keystrokes were not observed.

## Practice state at pause

The last file inspection on 2026-09-07 found:

```text
$PRACTICE/
├── archive/
│   ├── project-notes-reviewed.txt
│   └── shopping.txt
├── handoff/
│   ├── project-notes-reviewed.txt
│   └── supplies.txt
├── inbox/
│   ├── project-notes-reviewed.txt
│   └── shopping.txt
├── spare-copies/
│   ├── project-notes-reviewed.txt
│   └── shopping.txt
├── working/
│   ├── project-notes-reviewed.txt
│   └── shopping.txt
└── start.txt
```

The reviewed notes in `working`, `inbox`, and `handoff` include `Ready for review.` The notes in `archive` and `spare-copies` retain their original contents. The shopping list copies have the same contents despite the renamed handoff copy.

Tab locations were confirmed at exercise 20, but the final challenge allowed either navigation method. The current tab, folder, highlight, and whether Yazi is still open are unverified. Confirm the visible state before the next exercise.
