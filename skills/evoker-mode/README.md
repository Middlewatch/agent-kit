# Evoker Mode

This idea was borrowed from `poteto-mode` from pstack/poteto. The idea is to route different scenarios through different workflows and avoid having to handhold every agent on every task. Ideally we can, with some degree of predictability, nudge models to choose the right workflow to fit the task at hand and recieve better outputs on average than we otherwise get from standard prompting and skills alone. 

Personally I have ran into issue with workflows from two different directions: 1. I have worked with a pretty barebones Pi with minimal skills, no extensions and basic prompting and current frontier models are pretty good, they love to randomly do lots of things you didnt ask them to or want them to do. For example GPT 5.6 absolutely adores writing super secure, heavily locked down, extremely opinionated database worthy scheme for file folders and simple CLI tools. To the point where if you aren't paying attention it will build you something that will pass 500 tests but be completely unusable in practice.

Conversely I have also developed workflows that were overly deterministic and required too much ceremony and ended up hamstringing the models reasoning and decision making capabilities to the point where I was getting nothing done over days and days of work. Once I took those restrictions away the same models were able to complete the same amount of work much more quickly. 

The primary takeaway here is: it is impossible to have a one size fits all workflow for everything. It's similarly impossible to expect that models are going to understand your intent, or that you are going to convey your intent effectively, 100% of the time, every time. So the more you can write down in advance and the smarter you can get with routing across those decision trees, the LLMs will start to converge on a product that actually fits your expectations. (Hopefully, these are still statistical models, not detemrinistic)

## Contents

Everything lives under this one skill directory so only the router's
`SKILL.md` registers; playbooks and principles are frontmatter-free files
beneath it.

| path | what |
|---|---|
| `SKILL.md` | The router: triggers, principle index, delegation doctrine, playbook index. |
| `guidance/playbook-standard.md` | Router contract and playbook file format: verbatim step copy, visible `skip: <reason>`, sizing rules. |
| `guidance/trail-standard.md` | Decision-trail format, when a trail earns its place, pause/resume conventions. |
| `guidance/planning-map.md` | The long-horizon decision map format. |
| `playbooks/TEMPLATE.md` | The playbook file template. |
| `playbooks/*.md` | Task-shape step lists (investigation, bug-fix, hillclimb, trace-forensics, refactoring, prototype, interrogate, authoring-a-skill, long-horizon-planning, session-pickup, pause-safely). |
| `principles/*.md` | 20 leaf principle files, adapted from pstack near verbatim. |
| `tools/trail/trail` | Append-only TSV decision logger: owns header, UTC timestamp, cell sanitization, formula-prefix escaping. The kit's `deployments.json` links it into `~/.local/bin`. |
| `tools/trail/test_trail.sh` | The trail tool's gate, 15 checks. |

## Provenance

- The router/playbook split, verbatim-copy rule, and visible-skip rule are
  from pstack's `poteto-mode` skill.
- The trail columns and the sanitization behavior in `trail` are from
  pstack's `show-me-your-work/scripts/log.sh`.
- Departures: the resume note lives at the worktree root as `RESUME.md`, pickup falls back to `memory_search`, and trails default to
  gitignored with commit as an owner choice.
