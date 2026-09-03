import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { isMode, saveUserMode } from "./config.ts";
import type { EffectiveConfig, Mode } from "./contracts.ts";

const COMMAND_USAGE = "Usage: /interlock off|audit|shield" as const;

interface ControlOptions {
  agentDir: string;
  config: EffectiveConfig;
  home: string;
  startupOverride?: Mode | undefined;
}

function footer(ctx: ExtensionContext, mode: Mode): void {
  if (!ctx.hasUI) return;
  try {
    ctx.ui.setStatus("interlock", `Interlock: ${mode}`);
  } catch {
    // Mode visibility must not alter enforcement.
  }
}

function announce(
  ctx: ExtensionContext,
  message: string,
  level: "info" | "error",
): void {
  if (!ctx.hasUI) {
    console.error(message);
    return;
  }
  try {
    ctx.ui.notify(message, level);
  } catch {
    console.error(message);
  }
}

function overrideNote(startupOverride: Mode | undefined, mode: Mode): string {
  if (startupOverride === undefined) return "";
  if (startupOverride === mode)
    return `; PI_INTERLOCK_MODE=${startupOverride} is the startup override`;
  return `; saved default, but PI_INTERLOCK_MODE=${startupOverride} will override it after reload or restart`;
}

export function registerControl(
  pi: ExtensionAPI,
  options: ControlOptions,
): void {
  pi.on("session_start", (_event, ctx) => {
    footer(ctx, options.config.mode);
  });

  pi.registerCommand("interlock", {
    description: "Show or change the Interlock security mode",
    getArgumentCompletions: (prefix) => {
      const values = ["off", "audit", "shield"].filter((value) =>
        value.startsWith(prefix),
      );
      return values.length === 0
        ? null
        : values.map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      const argument = args.trim();
      if (argument.length === 0) {
        announce(
          ctx,
          `Interlock active mode: ${options.config.mode}${overrideNote(options.startupOverride, options.config.mode)}`,
          "info",
        );
        return;
      }
      if (!isMode(argument)) {
        announce(ctx, COMMAND_USAGE, "error");
        return;
      }

      try {
        saveUserMode(
          { agentDir: options.agentDir, home: options.home },
          argument,
        );
      } catch {
        announce(
          ctx,
          "Interlock mode unchanged: could not save global configuration",
          "error",
        );
        return;
      }

      options.config.mode = argument;
      footer(ctx, argument);
      announce(
        ctx,
        `Interlock active mode: ${argument}${overrideNote(options.startupOverride, argument)}`,
        "info",
      );
    },
  });
}
