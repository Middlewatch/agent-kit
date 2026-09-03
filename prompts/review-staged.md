---
description: Review staged git changes before committing
---
Review the staged changes (`git diff --cached`). Focus on:
- Bugs and logic errors
- Security issues
- Error handling gaps
- Places where the diff and the docs it touches disagree

Report findings by severity with file:line references. Say so plainly if the
diff looks clean.
