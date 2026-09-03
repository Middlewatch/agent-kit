/**
 * Agent definitions: versioned role files the root can invoke by name but
 * never define or modify per call. Each `agents/<name>.agent.md` carries
 * simple `key: value` frontmatter (profile base, optional tier, thinking,
 * tools subset, writable, turnCap) and a markdown role prompt the parent
 * appends to the child contract. Unknown keys and invalid values fail the
 * whole load.
 */

import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { DELEGATE_PROFILE_NAMES, type DelegateProfileName } from "./profile.ts";
import { THINKING_LEVELS, TIER_NAMES, type ThinkingLevel, type TierName } from "./tiers.ts";

/** Every tool name a definition's `tools` subset may reference. */
export const KNOWN_CHILD_TOOLS: ReadonlySet<string> = new Set([
  "inspect_read",
  "inspect_grep",
  "inspect_find",
  "inspect_ls",
  "inspect_git_status",
  "inspect_git_diff",
  "web_search",
  "web_fetch",
  "write_file",
  "edit_file",
  "git_commit",
]);

export interface AgentDefinition {
  name: string;
  profile: DelegateProfileName;
  tier?: TierName;
  thinking?: ThinkingLevel;
  /** Restriction of the profile's capability set; unset means the full set. */
  tools?: string[];
  writable: boolean;
  turnCap?: number;
  rolePrompt: string;
}

const ALLOWED_KEYS = new Set(["profile", "tier", "thinking", "tools", "writable", "turnCap"]);

export function parseAgentDefinition(name: string, source: string): AgentDefinition {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`agent ${name}: missing frontmatter`);
  const [, frontmatter, body] = match;
  const fields = new Map<string, string>();
  for (const line of frontmatter.split("\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator === -1) throw new Error(`agent ${name}: malformed frontmatter line: ${line}`);
    const key = line.slice(0, separator).trim();
    if (!ALLOWED_KEYS.has(key)) throw new Error(`agent ${name}: unknown key ${key}`);
    if (fields.has(key)) throw new Error(`agent ${name}: duplicate key ${key}`);
    fields.set(key, line.slice(separator + 1).trim());
  }

  const profile = fields.get("profile");
  if (profile === undefined) throw new Error(`agent ${name}: profile is required`);
  if (!(DELEGATE_PROFILE_NAMES as readonly string[]).includes(profile)) {
    throw new Error(`agent ${name}: unsupported profile: ${profile}`);
  }

  const tier = fields.get("tier");
  if (tier !== undefined && !(TIER_NAMES as readonly string[]).includes(tier)) {
    throw new Error(`agent ${name}: unsupported tier: ${tier}`);
  }

  const thinking = fields.get("thinking");
  if (thinking !== undefined && !(THINKING_LEVELS as readonly string[]).includes(thinking)) {
    throw new Error(`agent ${name}: unsupported thinking: ${thinking}`);
  }

  let tools: string[] | undefined;
  const toolsRaw = fields.get("tools");
  if (toolsRaw !== undefined) {
    tools = toolsRaw.split(",").map((entry) => entry.trim()).filter(Boolean);
    if (tools.length === 0) throw new Error(`agent ${name}: tools must name at least one tool`);
    for (const tool of tools) {
      if (!KNOWN_CHILD_TOOLS.has(tool)) throw new Error(`agent ${name}: unknown tool ${tool}`);
    }
  }

  const writableRaw = fields.get("writable");
  if (writableRaw !== undefined && writableRaw !== "true" && writableRaw !== "false") {
    throw new Error(`agent ${name}: writable must be true or false`);
  }

  let turnCap: number | undefined;
  const turnCapRaw = fields.get("turnCap");
  if (turnCapRaw !== undefined) {
    turnCap = Number(turnCapRaw);
    if (!Number.isInteger(turnCap) || turnCap < 1 || turnCap > 100) {
      throw new Error(`agent ${name}: turnCap must be an integer between 1 and 100`);
    }
  }

  const rolePrompt = body.trim();
  if (!rolePrompt) throw new Error(`agent ${name}: role prompt body is required`);

  return {
    name,
    profile: profile as DelegateProfileName,
    tier: tier as TierName | undefined,
    thinking: thinking as ThinkingLevel | undefined,
    tools,
    writable: writableRaw === "true",
    turnCap,
    rolePrompt,
  };
}

/**
 * Load every `<name>.agent.md` in the directory. Fail closed on a missing
 * directory or any broken file: the seed agents are versioned beside the
 * extension, so their absence is an install defect, not an empty roster.
 */
export function loadAgentDefinitions(dir: string): Map<string, AgentDefinition> {
  const agents = new Map<string, AgentDefinition>();
  const entries = readdirSync(dir);
  for (const entry of entries.sort()) {
    if (!entry.endsWith(".agent.md")) continue;
    const name = basename(entry, ".agent.md");
    agents.set(name, parseAgentDefinition(name, readFileSync(join(dir, entry), "utf8")));
  }
  return agents;
}
