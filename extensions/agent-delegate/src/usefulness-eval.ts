export interface EvalFinding {
  id: string;
  path: string;
  line: number;
  citation?: string;
  evidence?: string;
}

export interface EvalOracle {
  id: string;
  path: string;
  line: number;
}

export interface UsefulnessScore {
  defectRecall: number;
  falsePositives: number;
  supportedCitations: number;
  unsupportedCitations: number;
  correctedProvisionalClaim: boolean;
}

/** Deterministic outcome scorer used by the opt-in real-model evaluation. */
export function scoreUsefulness(findings: EvalFinding[], oracle: EvalOracle[]): UsefulnessScore {
  const expected = new Map(oracle.map((item) => [item.id, item]));
  const matchedIds = new Set<string>();
  let falsePositives = 0;
  let supportedCitations = 0;
  let unsupportedCitations = 0;
  for (const finding of findings) {
    const match = expected.get(finding.id);
    if (!match) {
      falsePositives += 1;
      unsupportedCitations += 1;
      continue;
    }
    if (
      finding.path === match.path && finding.line === match.line &&
      finding.citation === `${match.path}:${match.line}`
    ) {
      matchedIds.add(match.id);
      supportedCitations += 1;
    } else {
      falsePositives += 1;
      unsupportedCitations += 1;
    }
  }
  return {
    defectRecall: oracle.length === 0 ? 1 : matchedIds.size / oracle.length,
    falsePositives,
    supportedCitations,
    unsupportedCitations,
    correctedProvisionalClaim: matchedIds.size > 0,
  };
}
