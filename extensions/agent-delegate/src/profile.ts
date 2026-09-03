import type { TierName } from "./tiers.ts";

export const DELEGATE_PROFILE_NAMES = ["explore", "review", "research"] as const;

export type DelegateProfileName = (typeof DELEGATE_PROFILE_NAMES)[number];
export type ReturnMode = "prose" | "typed";
export type DelegatePoolName = "prose" | "typed" | "writer";

export interface DelegateProfile {
  name: DelegateProfileName;
  /** Default model tier; tiers.json owns the slug and default thinking. */
  tier: TierName;
  returnMode: ReturnMode;
  webTools: boolean;
  scopeRequired: boolean;
  turnCap: number;
  pool: DelegatePoolName;
}

export const POOL_LIMITS: Record<DelegatePoolName, number> = { prose: 3, typed: 12, writer: 2 };

const PROFILES: Record<DelegateProfileName, DelegateProfile> = {
  explore: {
    name: "explore",
    tier: "scout",
    returnMode: "prose",
    webTools: false,
    scopeRequired: true,
    turnCap: 30,
    pool: "prose",
  },
  review: {
    name: "review",
    tier: "analyst",
    returnMode: "prose",
    webTools: false,
    scopeRequired: true,
    turnCap: 30,
    pool: "prose",
  },
  research: {
    name: "research",
    tier: "analyst",
    returnMode: "typed",
    webTools: true,
    scopeRequired: false,
    turnCap: 30,
    pool: "typed",
  },
};

export function resolveDelegateProfile(value: unknown): DelegateProfile {
  const name = value === undefined ? "explore" : value;
  if (typeof name !== "string" || !(DELEGATE_PROFILE_NAMES as readonly string[]).includes(name)) {
    throw new Error(`unsupported delegate profile: ${String(name)}`);
  }
  return PROFILES[name as DelegateProfileName];
}
