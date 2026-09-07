# Dolphin walkthrough

## Checkpoint

- Status: paused after the Dolphin/chezmoi integration, followed by an unsuccessful appearance trial, 2026-09-07.
- Goal: use Dolphin's navigation and integration features while performing the configuration work personally.
- Last confirmed integration result: the custom `Show chezmoi diff` action worked, its file was managed by chezmoi and committed to Git, and its scoped chezmoi diff was empty after a permissions correction.
- Remaining state: Kvantum and its trial preferences were left installed but unused and outside chezmoi. Breeze remained the global application style. The transparency result did not meet the learner's goal.
- Skipped: ZIP creation and further basic file operations at the learner's request. Several less-obvious shortcuts were explained but not tested.
- Resume: confirm the present Dolphin setup, then use a previously practiced navigation or lookup goal before a recap. The learner requested moving beyond basic file actions; do not restart that material unless the attempt reveals a need.
- Next topic: choose with the learner. The integration is complete; further chezmoi practice and appearance work have different consequences and should remain separate choices.
- Evidence: [redacted session log](SESSION.md), session `01a074ba-b7ed-70a1-a7d9-72eae660cade`. Historical confirmations do not establish current cross-machine behavior or delayed retention.

## Setup and replay boundaries

The source run used Dolphin 26.08. Baloo was disabled, Git integration was installed but initially disabled in Dolphin, and chezmoi already managed selected files. The custom action-finder binding and service menu below were configured during the walkthrough.

`$WORKSPACE` means a chosen local project, `$PRACTICE` a disposable directory, and `$LIVE` a specific already-managed live file. Substitute their actual paths when typing into Dolphin's location bar. Do not assume an environment variable expands in a GUI field.

For a fresh disposable file-operation area:

```bash
PRACTICE=$(mktemp -d "${TMPDIR:-/tmp}/dolphin-walkthrough.XXXXXX")
mkdir "$PRACTICE/Source" "$PRACTICE/Destination"
printf 'Disposable Dolphin practice.\n' > "$PRACTICE/Source/practice.txt"
printf 'Practice directory: %s\n' "$PRACTICE"
dolphin "$PRACTICE"
```

The original learner created these materials through Dolphin under Documents. The commands above are an optional fresh setup, not a record of keystrokes used in that session. Keep any existing practice path in local workspace notes.

Read-only browsing can use existing folders. Service-menu creation, managed-file updates, Git commits, and package installation change persistent state; agree on the actual targets before repeating them. Keep synchronization scripts excluded during the scoped chezmoi apply exercises. This tutorial does not authorize broad `chezmoi apply`, publishing dotfiles, or installing appearance packages.

## Exercises

### 1. Distinguish a path from browsing history

Use `Ctrl+L` to open the chosen workspace, `Alt+Up` for its parent, and `Alt+Left` to go back. Use `F6` to return the location field to clickable breadcrumbs when needed.

Outcome: the learner confirmed both navigation behaviors. Up follows folder hierarchy; Back follows browsing history.

### 2. Bookmark useful locations in Places

Use `F9`, add the workspace through its context menu's `Add to Places`, then test it from Home. Add or edit entries for live configs at `~/.config` and the chezmoi source directory, using labels that distinguish them.

Outcome: the learner confirmed the bookmarks and recognized `.config` versus `dot_config`. A bookmark does not move a folder; editing chezmoi source does not change live configuration until applied.

### 3. Browse two folders in split view

Open live configs, press `F3`, activate the other pane, and open the chezmoi `dot_config` directory there.

Outcome: both panes worked, and Places changed only the active pane. Split view does not itself compare contents or interpret chezmoi naming rules.

### 4. Use the integrated terminal

Navigate to a known local folder, press `F4`, run `pwd`, then `cd ..`. Re-enter the folder graphically and check `pwd` again.

Outcome: user-confirmed two-way local directory synchronization. This is a real shell with normal permissions, not a simulated console.

### 5. Filter the current listing

Hide the terminal with `F4`. In live configs, press `Ctrl+I` and try `kwin`, then `kglobal`; clear the filter with `Esc`.

Outcome: user-confirmed filtered listings. This operation neither descends into subfolders nor searches file contents.

### 6. Search beneath the current folder

From the workspace, use `Ctrl+F`, choose `This Folder`, and search for a known nested filename. The actual target was `scripts/inventory.py`; choose an existing equivalent on another machine. Open its containing folder from the result.

Outcome: the nested result appeared and its folder opened while Baloo stayed disabled. On-demand scanning was explained as a cost that depends on scope, especially for large or remote trees.

### 7. Keep locations in tabs

Use `Ctrl+T` to retain live-config and chezmoi locations, switch between them, then close one with `Ctrl+W`.

Outcome: each tab retained its location.

### 8. Copy a disposable file

Create `Source`, `Destination`, and `Source/practice.txt` in the practice area if they do not already exist. In split view, copy with `Ctrl+C`, activate Destination, and paste with `Ctrl+V`.

Outcome: the learner confirmed the file existed in both folders.

### 9. Undo, move, and restore

Undo the copy with `Ctrl+Z`. Cut with `Ctrl+X`, paste in Destination with `Ctrl+V`, then undo the move.

Outcome: the learner confirmed the file returned to Source. Cut performs the move at paste time. Undo applies to the latest supported operation, which need not belong to the currently visible pane.

### 10. Restore from Trash

Delete the disposable file with `Delete`, open Trash, and choose `Restore` on it.

Outcome: the learner confirmed its return to Source. Permanent deletion with `Shift+Delete` was explained but not practiced; remote Trash behavior can differ.

### 11. Inspect hidden files and details

Use `Alt+.` to show hidden files and `Ctrl+3` for Details view. Open `.config` and sort by Modified.

Outcome: user-confirmed visibility and sorting. Icons (`Ctrl+1`) and Compact (`Ctrl+2`) were mentioned without separate checks.

### 12. Inspect previews and metadata

Press `F11` and hover over a Markdown file, other files, folders, and an image.

Outcome: the information panel updated and the image preview worked.

### 13. Create a ZIP archive

Assigned: compress Source to ZIP and inspect the archive.

Outcome: skipped before execution. The learner requested Dolphin-specific capabilities instead of more basic file actions. No archive result was confirmed.

### 14. Consider less-obvious shortcuts

The assistant suggested copying or moving to the other pane with `Ctrl+F5` or `Ctrl+F6`, opening a separate terminal with `Shift+F4`, inverting selection with `Ctrl+Shift+A`, and pasting clipboard data to create a file.

Outcome: suggested only, not separately practiced. Confirm bindings in the installed version before using these as recipes.

### 15. Discover actions and resolve a shortcut conflict

The attempted action-finder shortcut `Ctrl+Alt+I` did nothing. Use Settings → Configure Keyboard Shortcuts to locate Find Action or Command Bar; `Ctrl+M` can reveal a hidden menu bar. The learner rebound the action to `Ctrl+Shift+I`.

Outcome: the custom binding worked. Keyd interception was suspected but never established. Dolphin's action finder differs from the desktop-wide KRunner launcher.

### 16. Enable and inspect Git integration

Open the chezmoi source repository. In Configure Dolphin, enable Git under Context Menu. When checking it did not expose the actions, close all Dolphin windows and reopen. Use Git → Log on a tracked file.

Outcome: the learner confirmed Git actions and history after the full restart. Git diff compares repository state; chezmoi diff compares calculated target state with the live destination.

### 17. Browse over SFTP

Open a new tab and enter a locally valid `sftp://<remote-user>@<remote-host>/<remote-home>` address. Browse without changing files.

Outcome: the learner reached the remote home through KIO without using the existing SSHFS mount. An SFTP tab does not turn the integrated terminal into a remote shell; ordinary local tools still need a local path or their own remote connection.

### 18. Inspect chezmoi source and target state

Choose one already-managed live file and run:

```bash
chezmoi source-path "$LIVE"
chezmoi diff --no-pager -- "$LIVE"
```

Outcome: the source path pointed into `dot_config`, and the scoped diff returned silently. Source is stored input; target is what chezmoi calculates; destination is what currently exists. An error is not an empty successful diff.

### 19. Create a service menu

The learner created `~/.local/share/kio/servicemenus/chezmoi-diff.desktop` and made it executable with `chmod u+x`. The working definition, after the retry below, is:

```ini
[Desktop Entry]
Type=Service
MimeType=application/octet-stream;
Actions=ShowChezmoiDiff;
X-KDE-Protocol=file
X-KDE-RequiredNumberOfUrls=1

[Desktop Action ShowChezmoiDiff]
Name=Show chezmoi diff
Icon=edit-find
Exec=konsole --hold -e chezmoi diff --no-pager -- %f
```

The action accepts one local file and opens its diff in Konsole. `%f` is supplied by Dolphin. This requires the existing commands and a file managed by chezmoi.

Initial outcome: the menu stayed absent despite correct location, executable permission, and an enabled Context Menu entry.

### 20. Recover the missing service-menu action

The learner tried fully restarting Dolphin and expanding Actions. Temporarily removing the protocol restriction did not help, so it was restored. The agent reproduced the problem with `X-KDE-Submenu=Chezmoi`; the learner removed that line.

Outcome: the direct action appeared and opened its viewer. Blank output was expected for a file already matching its target. The submenu incompatibility was environment-specific, not a general prohibition on KDE submenus.

### 21. Produce a visible chezmoi difference

Create a disposable live file with `colour=blue`, then manage it with `chezmoi add`. Change only the live file to `colour=green` and invoke Show chezmoi diff.

Outcome: the learner confirmed a diff removing live green and adding managed blue. The viewer previews what apply would do; it does not apply the change.

### 22. Apply managed state to the live file

For the agreed disposable target, run `chezmoi apply --exclude=scripts -- "$LIVE"`. Inspect its contents and invoke the custom diff again.

Outcome: this was pending across a pause, then confirmed on resume. The file returned to blue and the diff became empty. The scripts exclusion kept unrelated chezmoi hooks out of the exercise.

### 23. Capture a live change into source state

Change the live practice file to green, run `chezmoi add` on that exact file, and locate its source with `chezmoi source-path`.

Outcome: the scoped chezmoi diff was empty, but Dolphin showed the new source as untracked in Git. Agreement between managed and live state does not mean the repository is committed.

### 24. Manage the real service menu

Assigned cleanup: forget the disposable file in chezmoi, then trash the live practice file. Manage the actual service-menu definition with `chezmoi add` and inspect its source path.

Outcome: the learner confirmed `executable_chezmoi-diff.desktop` in the source path. The transcript does not separately confirm trashing the disposable file. `dot_` encodes a leading dot; `executable_` encodes executable status.

### 25. Stage only the service menu

On its source file, use Dolphin's Git → Add. In the integrated terminal, run `git diff --cached`.

Outcome: the staged diff contained only the service-menu definition and omitted the broken submenu line. `chezmoi add` captures live state into source; Git Add stages source for a commit. Neither publishes it.

### 26. Find the correct Git commit menu

The initial file-context-menu instruction was wrong. The installed plugin exposed Git Commit in the folder-background context menu instead. Right-click empty space, choose Git Commit, inspect the staged change, and leave Amend unchecked for an ordinary new checkpoint.

Outcome: the learner confirmed the commit and checks; the agent reported a clean Git tree. A Git commit records locally. Publishing requires a separate decision.

### 27. Reconcile file permissions

The agent's subsequent check found matching contents but a chezmoi difference between live mode `0744` and target mode `0755`. Apply only the agreed service-menu file with scripts excluded, then inspect its scoped chezmoi diff.

Outcome: the learner confirmed a silent diff. The executable source attribute produced standard executable permissions. Git cleanliness and chezmoi agreement required separate checks.

### 28. Trial Dolphin background transparency

The learner used the appearance question as a possible future experiment-and-capture workflow. Whole-window opacity also fades text and icons; the desired background effect depended on a compatible style. Relevant KDE configuration files were not managed by chezmoi.

Kvantum was installed for a limited trial without changing the global Breeze style. Selecting `KvRoughGlass` and launching `dolphin -style kvantum` produced a bright window without the desired transparency.

Outcome: the trial failed the visible goal. Installation details were specific to that machine and are not a portable setup prescription.

### 29. Retry the appearance trial and stop

The learner tried `KvGnomeDark`, Transparent Dolphin view, translucent windows, 30% opacity reduction, and blur, then relaunched the isolated style trial.

Outcome: transparency appeared only when unfocused, which the learner judged no better than the existing KDE behavior. They stopped troubleshooting and left Kvantum and its preferences installed but unused and outside chezmoi. No successful customization or later cleanup is claimed.

## State to verify on resume

The service-menu integration and custom action-finder shortcut were confirmed during the session. Recheck their presence, installed version, and live/source agreement before building on them on another machine. Existing Places, tabs, Git plugin loading, remote access, and the active folder are machine-local.

The transcript cannot establish whether the disposable live chezmoi practice file was trashed, whether appearance packages were removed later, or whether the original shortcut was intercepted by keyd. Keep those unknowns separate from completed exercises.
