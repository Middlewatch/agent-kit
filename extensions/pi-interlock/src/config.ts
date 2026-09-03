import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";

import type {
  ConfigDiagnostic,
  CredentialRoot,
  EffectiveConfig,
  Mode,
} from "./contracts.ts";
import { canonicalizePath } from "./paths.ts";

const MODES = new Set<Mode>(["off", "audit", "shield"]);

export function isMode(value: string): value is Mode {
  return MODES.has(value as Mode);
}
const CONFIG_KEYS = new Set([
  "schemaVersion",
  "mode",
  "credentialPaths",
  "estateRoots",
  "ephemeralRoots",
]);

export interface LoadConfigInput {
  agentDir: string;
  home: string;
  processMode?: string | undefined;
  scratchpad?: string | undefined;
  diagnostic?: (message: ConfigDiagnostic) => void;
}

function canonical(path: string, home: string): string {
  return canonicalizePath(path, home, home);
}

function credentialRoots(agentDir: string, home: string): CredentialRoot[] {
  const root = (path: string, kind: "exact" | "tree"): CredentialRoot => ({
    path: canonical(path, home),
    kind,
    ruleId: "credential.direct-access",
  });
  return [
    root(join(agentDir, "auth.json"), "exact"),
    root(join(agentDir, "keys"), "tree"),
    {
      ...root(join(agentDir, "var/interlock"), "tree"),
      ruleId: "credential.audit-access",
    },
    root(join(home, ".ssh"), "tree"),
    root(join(home, ".gnupg"), "tree"),
    root(join(home, ".aws"), "tree"),
    root(join(home, ".azure"), "tree"),
    root(join(home, ".kube"), "tree"),
    root(join(home, ".config/gcloud"), "tree"),
    root(join(home, ".config/rpiv-web-tools"), "tree"),
    root(join(home, ".docker/config.json"), "exact"),
    root(join(home, ".netrc"), "exact"),
    root(join(home, ".pypirc"), "exact"),
    root(join(home, ".git-credentials"), "exact"),
  ];
}

function builtInEstateRoots(home: string): string[] {
  return [
    "projects",
    "vendor",
    "work",
    "research",
    "experiments",
    "archive",
    "wiki",
    "journals",
    "intake",
    "models",
  ].map((name) => canonical(join(home, name), home));
}

function topLevelKeys(text: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let index = 0;
  let expectsKey = false;
  while (index < text.length) {
    const char = text[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '"') {
      const start = index;
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
          continue;
        }
        if (text[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      if (depth === 1 && expectsKey) {
        const value = JSON.parse(text.slice(start, index)) as string;
        while (index < text.length && /\s/.test(text[index]!)) index += 1;
        if (text[index] === ":") {
          keys.push(value);
          expectsKey = false;
        }
      }
      continue;
    }
    if (char === "{") {
      depth += 1;
      if (depth === 1) expectsKey = true;
    } else if (char === "}") {
      depth -= 1;
    } else if (char === "," && depth === 1) {
      expectsKey = true;
    }
    index += 1;
  }
  return keys;
}

function configuredPaths(value: unknown, home: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("wrong type");
  const result: string[] = [];
  for (const path of value) {
    if (
      typeof path !== "string" ||
      path.length === 0 ||
      path.includes("\0") ||
      /[*?[]/.test(path) ||
      !(
        isAbsolute(path) ||
        path === "~" ||
        path.startsWith("~/") ||
        path === "$HOME" ||
        path.startsWith("$HOME/") ||
        path === "${HOME}" ||
        path.startsWith("${HOME}/")
      )
    )
      throw new Error("invalid path");
    const resolved = canonical(path, home);
    if (!result.includes(resolved)) result.push(resolved);
  }
  return result;
}

interface UserConfigDocument extends Record<string, unknown> {
  schemaVersion: 2;
  mode: Mode;
}

function parseUserDocument(text: string): UserConfigDocument {
  const keys = topLevelKeys(text);
  if (new Set(keys).size !== keys.length) throw new Error("duplicate key");
  const value = JSON.parse(text) as unknown;
  if (value === null || Array.isArray(value) || typeof value !== "object")
    throw new Error("wrong type");
  const config = value as Record<string, unknown>;
  if (Object.keys(config).some((key) => !CONFIG_KEYS.has(key)))
    throw new Error("unknown key");
  if (
    config.schemaVersion !== 2 ||
    typeof config.mode !== "string" ||
    !isMode(config.mode)
  )
    throw new Error("invalid required value");
  return config as UserConfigDocument;
}

function userLayer(config: UserConfigDocument, home: string) {
  return {
    mode: config.mode,
    credentialPaths: configuredPaths(config.credentialPaths, home),
    estateRoots: configuredPaths(config.estateRoots, home),
    ephemeralRoots: configuredPaths(config.ephemeralRoots, home),
  };
}

function readUserDocument(agentDir: string): UserConfigDocument | undefined {
  const path = join(agentDir, "interlock.json");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return parseUserDocument(text);
}

function readUserLayer(input: LoadConfigInput) {
  const config = readUserDocument(input.agentDir);
  return config === undefined ? undefined : userLayer(config, input.home);
}

function replaceUserConfig(path: string, config: UserConfigDocument): void {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let replaced = false;
  try {
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(descriptor, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, path);
    replaced = true;
  } finally {
    if (!replaced) {
      try {
        unlinkSync(temporary);
      } catch {
        // The temporary file may not have been created.
      }
    }
  }
}

export function saveUserMode(
  input: Pick<LoadConfigInput, "agentDir" | "home">,
  mode: Mode,
): void {
  const existing = readUserDocument(input.agentDir);
  const config: UserConfigDocument = existing ?? {
    schemaVersion: 2,
    mode,
  };
  if (existing !== undefined) userLayer(existing, input.home);
  config.mode = mode;
  replaceUserConfig(join(input.agentDir, "interlock.json"), config);
}

function deduplicate(values: string[]): string[] {
  return [...new Set(values)];
}

export function loadConfig(input: LoadConfigInput): EffectiveConfig {
  let mode: Mode = "audit";
  let customCredentials: string[] = [];
  let customEstate: string[] = [];
  let customEphemeral: string[] = [];
  try {
    const layer = readUserLayer(input);
    if (layer !== undefined) {
      mode = layer.mode;
      customCredentials = layer.credentialPaths;
      customEstate = layer.estateRoots;
      customEphemeral = layer.ephemeralRoots;
    }
  } catch {
    input.diagnostic?.("interlock: invalid configuration");
  }

  const ephemeral = [
    canonical("/tmp", input.home),
    canonical("/var/tmp", input.home),
    canonical(join(input.home, ".cache"), input.home),
  ];
  if (input.scratchpad !== undefined && input.scratchpad.length > 0) {
    if (isAbsolute(input.scratchpad)) {
      try {
        ephemeral.push(canonical(input.scratchpad, input.home));
      } catch {
        input.diagnostic?.("interlock: invalid environment");
      }
    } else input.diagnostic?.("interlock: invalid environment");
  }

  if (input.processMode !== undefined) {
    if (MODES.has(input.processMode as Mode)) mode = input.processMode as Mode;
    else input.diagnostic?.("interlock: invalid environment");
  }

  return {
    mode,
    credentialRoots: [
      ...credentialRoots(input.agentDir, input.home),
      ...customCredentials.map((path): CredentialRoot => ({
        path,
        kind: "tree",
        ruleId: "credential.direct-access",
      })),
    ].filter(
      (root, index, roots) =>
        roots.findIndex(
          (candidate) =>
            candidate.path === root.path && candidate.kind === root.kind,
        ) === index,
    ),
    estateRoots: deduplicate([
      ...builtInEstateRoots(input.home),
      ...customEstate,
    ]),
    ephemeralRoots: deduplicate([...ephemeral, ...customEphemeral]),
  };
}
