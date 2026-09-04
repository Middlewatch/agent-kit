import { takeInstructions, type InstructionFile } from "./instructions.ts";
/**
 * The template splice: split Pi's assembled prompt into core and tail,
 * extract the live data from the stock core, and render an owner template
 * around it. Pure functions; the caller owns fail-open.
 */

/** Split the assembled prompt into [core, tail] at the first appended layer. */
export function splitTail(
  prompt: string,
  append?: string,
): [core: string, tail: string] {
  let boundary = prompt.length;
  for (const marker of [
    ...(append ? [`\n\n${append}`] : []),
    "\n\n<instruction_context>",
    "\n\n<project_context>",
    "\n\nThe following skills provide specialized instructions",
    "\n<available_skills>",
    "\nCurrent working directory:",
  ]) {
    const i = prompt.indexOf(marker);
    if (i !== -1) boundary = Math.min(boundary, i);
  }
  return [prompt.slice(0, boundary), prompt.slice(boundary)];
}

const SKILLS_START = "The following skills provide specialized instructions";
const SKILLS_END = "</available_skills>";

/**
 * Lift pi's stock skills block (preamble through the closing tag) out of
 * the tail so a template can place it at `{{SKILLS}}`. The block keeps
 * pi's exact text, so a registry extension that splices on those
 * sentinels (neoskills) works wherever the template put it. Returns the
 * block (empty when the tail has none) and the tail without it.
 */
export function liftSkillsBlock(tail: string): [block: string, rest: string] {
  const start = tail.indexOf(SKILLS_START);
  if (start === -1) return ["", tail];
  const endAt = tail.indexOf(SKILLS_END, start);
  if (endAt === -1) return ["", tail];
  const end = endAt + SKILLS_END.length;
  const block = tail.slice(start, end);
  // Drop the blank line that separated the block from what came before;
  // pi's own newline after the closing tag carries the rest.
  const before = tail.slice(0, start).replace(/\n+$/, "");
  return [block, before + tail.slice(end)];
}

/** Return the text between two anchors in the core, or null if absent. */
export function extract(
  core: string,
  start: string,
  end: string,
): string | null {
  const a = core.indexOf(start);
  if (a === -1) return null;
  const from = a + start.length;
  const b = core.indexOf(end, from);
  if (b === -1) return null;
  return core.slice(from, b);
}

/**
 * The `{{PI_SCRATCHPAD}}` body: one bullet naming the session's scratch
 * directory. The pi-scratchpad extension publishes the path in
 * `process.env.PI_SCRATCHPAD` at session_start; the template owns any heading.
 */
export function scratchpadSection(path: string | undefined): string {
  if (!path) return "";
  return (
    `- \`${path}\` (also \`$PI_SCRATCHPAD\` in bash) is a private scratch directory for this session. ` +
    "Write bulky intermediate output there instead of into the conversation: full gate and test logs, " +
    "raw command output, generated data, analysis scripts, then read back the summary. " +
    "Cite the path when you tell the user where the detail lives. It is deleted after a period of disuse."
  );
}

/**
 * Render the template with the stock core's live data spliced in. Returns
 * null when any anchor is missing (the stock shape drifted), so the caller
 * can leave the prompt as Pi built it. Placeholders are optional: an absent
 * placeholder means the template omits that section, and replaceAll no-ops.
 * `scratchpad` is the session scratch directory, or undefined when the
 * pi-scratchpad extension is not running; then `{{PI_SCRATCHPAD}}` renders
 * empty.
 */
export function renderTemplate(
  template: string,
  core: string,
  scratchpad?: string,
  skills = "",
  instructions = { global: "", workspace: "" },
): string | null {
  const tools = extract(
    core,
    "Available tools:\n",
    "\n\nIn addition to the tools above",
  );
  const guidelines = extract(core, "Guidelines:\n", "\n\nPi documentation");
  const docsAt = core.indexOf("Pi documentation (");
  if (tools === null || guidelines === null || docsAt === -1) return null;
  const docs = core.slice(docsAt).trimEnd();

  const slots: Record<string, string> = {
    AVAILABLE_TOOLS: tools,
    GUIDELINES: guidelines,
    PI_DOCS: docs,
    PI_SCRATCHPAD: scratchpadSection(scratchpad),
    SKILLS: skills,
    GLOBAL_INSTRUCTIONS: instructions.global,
    WORKSPACE_INSTRUCTIONS: instructions.workspace,
  };
  return template
    .replace(
      /{{(AVAILABLE_TOOLS|GUIDELINES|PI_DOCS|PI_SCRATCHPAD|SKILLS|GLOBAL_INSTRUCTIONS|WORKSPACE_INSTRUCTIONS)}}/g,
      (_match, name: string) => slots[name]!,
    )
    .trimEnd();
}

export function splicePrompt(
  template: string,
  prompt: string,
  options: { appendSystemPrompt?: string; contextFiles?: InstructionFile[] },
  scratchpad?: string,
): { prompt: string } | { reason: string } {
  const [core, rawTail] = splitTail(prompt, options.appendSystemPrompt);
  const append = options.appendSystemPrompt
    ? `\n\n${options.appendSystemPrompt}`
    : "";
  if (!rawTail.startsWith(append))
    return { reason: "appended prompt boundary not recognized" };
  const instructions = takeInstructions(
    rawTail.slice(append.length),
    options.contextFiles ?? [],
    template,
  );
  if (!instructions)
    return {
      reason:
        "instruction scope or boundary not recognized (or repeated instruction slot)",
    };
  const [skills, rest] = template.includes("{{SKILLS}}")
    ? liftSkillsBlock(instructions.rest)
    : ["", instructions.rest];
  const rendered = renderTemplate(
    template,
    core,
    scratchpad,
    skills,
    instructions,
  );
  if (rendered === null)
    return { reason: "stock core boundary not recognized" };
  return { prompt: rendered + append + instructions.fallback + rest };
}
