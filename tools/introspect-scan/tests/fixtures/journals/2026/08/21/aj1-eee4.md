# Debugging session, Claude Code harness
## User

Base directory for this skill: /srv/estate/.claude/skills/diagnose

# diagnose (fixture body)

Build a feedback loop that goes red on this exact bug.

the parser throws on empty input, find out why

## Assistant

Reproduced with an empty-string test; root cause is the missing guard.
