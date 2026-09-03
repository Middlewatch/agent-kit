import {
  getAgentDir,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { homedir, tmpdir } from "node:os";

import { normalizeToolCall } from "./src/adapters.ts";
import { AuditTrail, auditTestOptions } from "./src/audit.ts";
import { isMode, loadConfig } from "./src/config.ts";
import { registerControl } from "./src/control.ts";
import {
  operationFacts,
  type Decision,
  type NormalizedOperation,
} from "./src/contracts.ts";
import { canonicalizePath, PathResolutionError } from "./src/paths.ts";
import { decideOperation, pathResolutionDecision } from "./src/policy.ts";

const TEST_CONFIRM_TIMEOUT_VARIABLE =
  "PI_INTERLOCK_TEST_CONFIRM_TIMEOUT_MS" as const;

function testConfirmTimeout(): number | undefined {
  if (process.env.PI_INTERLOCK_TEST !== "1") return undefined;
  const raw = process.env[TEST_CONFIRM_TIMEOUT_VARIABLE];
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined;
  const milliseconds = Number(raw);
  return Number.isSafeInteger(milliseconds) && milliseconds > 0
    ? milliseconds
    : undefined;
}

function hold(decision: Decision): { block: true; reason: string } {
  return {
    block: true,
    reason: `[${decision.ruleId}] ${decision.reason}`,
  };
}

function unresolvedOperation(
  tool: string,
  cwd: string,
  home: string,
): NormalizedOperation {
  return {
    tool,
    cwd,
    authorityRoot: cwd,
    paths: [],
    recursiveDeletes: [],
    catastrophic: [],
    pushes: [],
    observations: [],
    [operationFacts]: { home, repositoryRoots: [] },
  };
}

export default function interlock(pi: ExtensionAPI): void {
  const lexicalHome = homedir();
  const home = canonicalizePath(lexicalHome, process.cwd(), lexicalHome);
  const agentDir = canonicalizePath(getAgentDir(), process.cwd(), home);
  const confirmTimeout = testConfirmTimeout();
  const scratchpad = process.env.PI_SCRATCHPAD;
  const config = loadConfig({
    agentDir,
    home,
    processMode: process.env.PI_INTERLOCK_MODE,
    scratchpad,
    diagnostic: (message) => console.error(message),
  });
  const audit = new AuditTrail({
    agentDir,
    config,
    diagnostic: (message) => console.error(message),
    ...auditTestOptions(process.env),
  });
  const processMode = process.env.PI_INTERLOCK_MODE;
  registerControl(pi, {
    agentDir,
    config,
    home,
    startupOverride:
      processMode !== undefined && isMode(processMode)
        ? processMode
        : undefined,
  });

  pi.on("tool_call", async (event, ctx) => {
    if (config.mode === "off") return undefined;
    let operation: NormalizedOperation;
    let decision: Decision;
    try {
      operation = normalizeToolCall(
        {
          toolName: event.toolName,
          input: event.input as Record<string, unknown>,
        },
        {
          cwd: ctx.cwd,
          home,
          tmpdir: process.env.TMPDIR ?? tmpdir(),
          ...(scratchpad === undefined ? {} : { scratchpad }),
        },
      );
      decision = decideOperation(config.mode, operation, config);
    } catch (error) {
      if (!(error instanceof PathResolutionError)) return undefined;
      operation = unresolvedOperation(event.toolName, ctx.cwd, home);
      decision = pathResolutionDecision(config.mode);
    }

    audit.record(operation, decision);
    if (audit.degraded && ctx.hasUI) {
      try {
        ctx.ui.setStatus("interlock-audit", "Interlock: audit degraded");
      } catch {
        // Reporting must not change the already-computed public disposition.
      }
    }

    if (decision.verdict === "deny") return hold(decision);
    if (decision.verdict !== "ask") return undefined;
    if (!ctx.hasUI) return hold(decision);

    try {
      let confirmed: boolean;
      if (confirmTimeout === undefined) {
        confirmed = await ctx.ui.confirm(
          "Interlock confirmation",
          decision.reason,
        );
      } else {
        const controller = new AbortController();
        let timeout: NodeJS.Timeout | undefined;
        try {
          confirmed = await Promise.race([
            ctx.ui.confirm("Interlock confirmation", decision.reason, {
              signal: controller.signal,
            }),
            new Promise<false>((resolve) => {
              timeout = setTimeout(() => {
                controller.abort();
                resolve(false);
              }, confirmTimeout);
            }),
          ]);
        } finally {
          if (timeout !== undefined) clearTimeout(timeout);
        }
      }
      return confirmed ? undefined : hold(decision);
    } catch {
      return hold(decision);
    }
  });
}
