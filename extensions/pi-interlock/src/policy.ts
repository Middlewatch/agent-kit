import {
  operationFacts,
  type Decision,
  type EffectiveConfig,
  type Mode,
  type NormalizedOperation,
  type RuleId,
} from "./contracts.ts";
import { pathIsWithin, pathPatternMayReach } from "./paths.ts";

const REASONS: Record<RuleId, string> = {
  "credential.direct-access": "Direct credential-store access is blocked.",
  "credential.audit-access": "Direct Interlock audit access is blocked.",
  "path.resolution-failed": "Path resolution failed; the operation is blocked.",
  "catastrophic.root-recursive":
    "Recursive filesystem-root deletion is blocked.",
  "catastrophic.raw-device": "Direct raw-device overwrite is blocked.",
  "catastrophic.filesystem-format": "Direct filesystem formatting is blocked.",
  "catastrophic.fork-bomb": "Direct process fork bomb is blocked.",
  "delete.boundary": "Confirm recursive deletion across a protected boundary.",
  "push.protected-branch": "Confirm push to a protected branch.",
  "push.force-or-bulk": "Confirm force or bulk push.",
  "default.allow": "No seatbelt rule matched.",
};

function decision(verdict: Decision["verdict"], ruleId: RuleId): Decision {
  return { verdict, ruleId, reason: REASONS[ruleId] };
}

function strictDescendant(path: string, root: string): boolean {
  return path !== root && pathIsWithin(path, root);
}

function protectedBranch(ref: string): boolean {
  const name = ref.startsWith("refs/heads/")
    ? ref.slice("refs/heads/".length)
    : ref;
  return name === "main" || name === "master";
}

export function shieldDecision(
  operation: NormalizedOperation,
  config: EffectiveConfig,
): Decision {
  for (const access of operation.paths) {
    for (const root of config.credentialRoots) {
      const matches =
        access.unresolvedGlob === true
          ? pathPatternMayReach(access.path, root.path, root.kind)
          : root.kind === "exact"
            ? access.path === root.path
            : pathIsWithin(access.path, root.path);
      if (matches) return decision("deny", root.ruleId);
    }
  }
  if (operation.catastrophic.length > 0)
    return decision("deny", operation.catastrophic[0]!);

  const facts = operation[operationFacts];
  const repositoryRoots = facts?.repositoryRoots ?? [];
  if (
    operation.recursiveDeletes.some(
      (deletion) =>
        deletion.targets.includes("/") ||
        deletion.unresolvedTargets.includes("/*"),
    )
  )
    return decision("deny", "catastrophic.root-recursive");
  for (const deletion of operation.recursiveDeletes) {
    if (deletion.unresolvedTargets.length > 0)
      return decision("ask", "delete.boundary");
    for (const target of deletion.targets) {
      const exactBoundary =
        target === facts?.home ||
        target === operation.authorityRoot ||
        config.estateRoots.includes(target) ||
        config.ephemeralRoots.includes(target) ||
        repositoryRoots.includes(target);
      if (exactBoundary) return decision("ask", "delete.boundary");
      if (config.ephemeralRoots.some((root) => strictDescendant(target, root)))
        continue;
      if (!strictDescendant(target, operation.authorityRoot))
        return decision("ask", "delete.boundary");
    }
  }

  for (const push of operation.pushes) {
    if (push.force || push.bulk !== "none")
      return decision("ask", "push.force-or-bulk");
    if (
      [...push.destinations, ...push.resolvedDestinations].some(protectedBranch)
    )
      return decision("ask", "push.protected-branch");
    const branchMatters =
      push.refspecs.length === 0 || push.refspecs.includes("HEAD");
    if (branchMatters && protectedBranch(push.currentBranch ?? ""))
      return decision("ask", "push.protected-branch");
  }
  return decision("allow", "default.allow");
}

export function decideOperation(
  mode: Mode,
  operation: NormalizedOperation,
  config: EffectiveConfig,
): Decision {
  if (mode === "off") return decision("allow", "default.allow");
  const shield = shieldDecision(operation, config);
  if (mode === "shield") return shield;
  return {
    ...decision("allow", "default.allow"),
    shadow: { verdict: shield.verdict, ruleId: shield.ruleId },
  };
}

export function pathResolutionDecision(mode: Mode): Decision {
  if (mode === "off") return decision("allow", "default.allow");
  const shield = decision("deny", "path.resolution-failed");
  if (mode === "shield") return shield;
  return {
    ...decision("allow", "default.allow"),
    shadow: { verdict: shield.verdict, ruleId: shield.ruleId },
  };
}
