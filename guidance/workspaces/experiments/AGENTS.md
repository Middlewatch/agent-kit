# Experiments Workspace

This root (the experiments root named in `~/.agents/MACHINE.md`) is my isolated staging area for package trials, harness
comparisons, and workflow experiments.

## Contract

- The working tree is the definitive state and every directory is deletable.
  Use version control only when I ask for it.
- Define the question, comparison arms, success metric, and teardown before
  running an experiment.
- Keep each invasive trial in its own directory with project-local `.pi/`
  settings or a dedicated `PI_CODING_AGENT_DIR`, so trial resources stay
  inside the trial and the global harness configuration stays untouched.
- Preserve completed fixtures and results as historical evidence, including
  legacy paths and harness names needed to reproduce what was tested.
- Promote only the smallest proven capability into a `~/.agents/projects` repository
  or the global configuration.

Package-evaluation skills belong in this root's `.pi/skills/` when
installed.
