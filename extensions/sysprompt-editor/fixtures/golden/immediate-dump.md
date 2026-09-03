# System prompt (best-effort rebuild at command time)

Rebuilt from ctx.getSystemPromptOptions() when the command ran. It
excludes per-turn changes made by other extensions; the provider
capture is the ground truth.

## Custom prompt

present

## Selected tools

- read: Read file contents
- bash: Execute bash commands
- edit: Make precise file edits
- write
- custom_tool

## Prompt guidelines

- Use bash for file operations
- Be concise in your responses

## Appended system prompt

`````
Appended layer with a fence inside:
```ts
const x = 1;
```
and a longer run ```` here.

`````

## Context files

- /srv/owner/projects/example/AGENTS.md (18 bytes)
- /srv/owner/.pi/agent/AGENTS.md (14 bytes)

## Skills

- harvest
- plan
