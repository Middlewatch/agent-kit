/**
 * Model tiers: spend policy stays extension-owned. `tiers.json` beside the
 * extension maps each tier to a model slug and a default reasoning level.
 * The root escalates routing by tier and thinking only; it can never supply
 * a slug, and a malformed table fails the extension at load.
 */

import { readFileSync } from "node:fs";

export const TIER_NAMES = ["scout", "analyst", "judge"] as const;
export type TierName = (typeof TIER_NAMES)[number];

export const THINKING_LEVELS = ["low", "medium", "high"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface TierRoute {
  model: string;
  thinking: ThinkingLevel;
}

export type TierTable = Record<TierName, TierRoute>;

export interface ResolvedRoute {
  tier: TierName;
  model: string;
  thinking: ThinkingLevel;
}

/** Parse and validate a tier table, failing closed on any deviation. */
export function parseTiers(source: string): TierTable {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (error) {
    throw new Error(`tiers.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("tiers.json: expected an object of tiers");
  const table = raw as Record<string, unknown>;
  for (const key of Object.keys(table)) {
    if (!(TIER_NAMES as readonly string[]).includes(key)) throw new Error(`tiers.json: unknown tier ${key}`);
  }
  const result = {} as TierTable;
  for (const name of TIER_NAMES) {
    const entry = table[name];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new Error(`tiers.json: missing tier ${name}`);
    const route = entry as Record<string, unknown>;
    for (const key of Object.keys(route)) {
      if (key !== "model" && key !== "thinking") throw new Error(`tiers.json: tier ${name} has unknown key ${key}`);
    }
    if (typeof route.model !== "string" || route.model.trim() === "") {
      throw new Error(`tiers.json: tier ${name} needs a non-empty model string`);
    }
    if (typeof route.thinking !== "string" || !(THINKING_LEVELS as readonly string[]).includes(route.thinking)) {
      throw new Error(`tiers.json: tier ${name} has invalid thinking: ${String(route.thinking)}`);
    }
    result[name] = { model: route.model, thinking: route.thinking as ThinkingLevel };
  }
  return result;
}

export function loadTiers(path: string): TierTable {
  return parseTiers(readFileSync(path, "utf8"));
}

/**
 * Resolve one child's route: the profile's default tier unless the call
 * names another, the tier's thinking unless the call names another. Both
 * params fail closed on values outside the fixed vocabularies.
 */
export function resolveRoute(table: TierTable, defaultTier: TierName, tier: unknown, thinking: unknown): ResolvedRoute {
  const tierName = tier === undefined ? defaultTier : tier;
  if (typeof tierName !== "string" || !(TIER_NAMES as readonly string[]).includes(tierName)) {
    throw new Error(`unsupported delegate tier: ${String(tierName)}`);
  }
  const route = table[tierName as TierName];
  const level = thinking === undefined ? route.thinking : thinking;
  if (typeof level !== "string" || !(THINKING_LEVELS as readonly string[]).includes(level)) {
    throw new Error(`unsupported thinking level: ${String(level)}`);
  }
  return { tier: tierName as TierName, model: route.model, thinking: level as ThinkingLevel };
}
