import {
  operationFacts,
  type Access,
  type NormalizeEnv,
  type NormalizedOperation,
  type PathAccess,
  type ToolCallInput,
} from "./contracts.ts";
import { gitOutput } from "./git.ts";
import { canonicalizePath } from "./paths.ts";
import { detectShell } from "./shell.ts";

export const MAX_DELETION_REPOSITORY_PROBES = 8;

function emptyOperation(tool: string, env: NormalizeEnv): NormalizedOperation {
  const cwd = canonicalizePath(env.cwd, env.cwd, env.home);
  const repositoryRoot = gitOutput(
    cwd,
    ["rev-parse", "--show-toplevel"],
    env.gitRunner,
  );
  const authorityRoot =
    repositoryRoot === undefined
      ? cwd
      : canonicalizePath(repositoryRoot, cwd, env.home);
  const operation: NormalizedOperation = {
    tool,
    cwd,
    authorityRoot,
    paths: [],
    recursiveDeletes: [],
    catastrophic: [],
    pushes: [],
    observations: [],
  };
  Object.defineProperty(operation, operationFacts, {
    value: { home: env.home, repositoryRoots: [] },
    enumerable: false,
  });
  return operation;
}

function discoverDeletionRepositoryRoots(
  operation: NormalizedOperation,
  env: NormalizeEnv,
): void {
  const repositoryRoots = operation[operationFacts]?.repositoryRoots;
  if (repositoryRoots === undefined) return;
  const probed = new Map<string, string | undefined>();
  const overBudget = new Set<string>();
  let probeCount = 0;
  for (const deletion of operation.recursiveDeletes) {
    for (const target of deletion.targets) {
      if (overBudget.has(target)) {
        if (!deletion.unresolvedTargets.includes(target))
          deletion.unresolvedTargets.push(target);
        continue;
      }
      if (!probed.has(target)) {
        if (probeCount >= MAX_DELETION_REPOSITORY_PROBES) {
          overBudget.add(target);
          if (!deletion.unresolvedTargets.includes(target))
            deletion.unresolvedTargets.push(target);
          continue;
        }
        probeCount += 1;
        probed.set(
          target,
          gitOutput(target, ["rev-parse", "--show-toplevel"], env.gitRunner),
        );
      }
      const root = probed.get(target);
      if (root === undefined) continue;
      const canonicalRoot = canonicalizePath(root, target, env.home);
      if (canonicalRoot === target && !repositoryRoots.includes(target))
        repositoryRoots.push(target);
    }
  }
  if (
    overBudget.size > 0 &&
    !operation.observations.includes("unresolved-delete-target")
  )
    operation.observations.push("unresolved-delete-target");
}

function pathAccess(
  path: string,
  access: Access,
  source: string,
  env: NormalizeEnv,
): PathAccess {
  return {
    path: canonicalizePath(path, env.cwd, env.home),
    access,
    source,
  };
}

function onePath(
  input: Record<string, unknown>,
  access: Access,
  env: NormalizeEnv,
  defaultPath?: string,
  allowFilePath = false,
): PathAccess[] | undefined {
  const hasPath = Object.hasOwn(input, "path");
  const hasFilePath = allowFilePath && Object.hasOwn(input, "file_path");
  if (hasPath && hasFilePath) return undefined;
  const key = hasPath ? "path" : hasFilePath ? "file_path" : undefined;
  if (key === undefined)
    return defaultPath === undefined
      ? undefined
      : [pathAccess(defaultPath, access, "default.cwd", env)];
  const value = input[key];
  return typeof value === "string"
    ? [pathAccess(value, access, `arg.${key}`, env)]
    : undefined;
}

function patchPaths(
  patch: string,
  env: NormalizeEnv,
): PathAccess[] | undefined {
  const lines = patch.split("\n");
  if (lines[0] !== "*** Begin Patch" || lines.at(-1) !== "*** End Patch")
    return undefined;
  const parsed: { path: string; access: Access; source: string }[] = [];
  let pendingUpdate: string | undefined;
  for (const line of lines.slice(1, -1)) {
    const match =
      /^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/.exec(line);
    if (match === null) {
      if (line.startsWith("*** ")) return undefined;
      continue;
    }
    const [, kind, path] = match;
    if (path === undefined || path.length === 0) return undefined;
    if (kind === "Move to") {
      if (pendingUpdate === undefined) return undefined;
      parsed.push({
        path: pendingUpdate,
        access: "move",
        source: "patch.update",
      });
      parsed.push({ path, access: "replace", source: "patch.move" });
      pendingUpdate = undefined;
    } else {
      if (pendingUpdate !== undefined)
        parsed.push({
          path: pendingUpdate,
          access: "edit",
          source: "patch.update",
        });
      pendingUpdate = kind === "Update File" ? path : undefined;
      if (kind === "Add File")
        parsed.push({ path, access: "create", source: "patch.add" });
      if (kind === "Delete File")
        parsed.push({ path, access: "delete", source: "patch.delete" });
    }
  }
  if (pendingUpdate !== undefined)
    parsed.push({
      path: pendingUpdate,
      access: "edit",
      source: "patch.update",
    });
  return parsed.length > 0
    ? parsed.map(({ path, access, source }) =>
        pathAccess(path, access, source, env),
      )
    : undefined;
}

export function normalizeToolCall(
  call: ToolCallInput,
  env: NormalizeEnv,
): NormalizedOperation {
  const operation = emptyOperation(call.toolName, env);
  switch (call.toolName) {
    case "read":
      operation.paths = onePath(call.input, "read", env, undefined, true) ?? [];
      break;
    case "write":
      operation.paths =
        onePath(call.input, "replace", env, undefined, true) ?? [];
      break;
    case "edit":
      operation.paths = onePath(call.input, "edit", env, undefined, true) ?? [];
      break;
    case "grep":
    case "find":
    case "ls":
      operation.paths = onePath(call.input, "read", env, ".") ?? [];
      break;
    case "delete":
      if (
        Object.hasOwn(call.input, "recursive") &&
        typeof call.input.recursive !== "boolean"
      )
        operation.observations.push("unsupported:delete");
      else {
        operation.paths = onePath(call.input, "delete", env) ?? [];
        if (call.input.recursive === true && operation.paths.length === 1) {
          operation.recursiveDeletes.push({
            targets: [operation.paths[0]!.path],
            unresolvedTargets: [],
            source: "tool.delete",
          });
        }
      }
      break;
    case "apply_patch": {
      const patch = call.input.patch;
      operation.paths =
        typeof patch === "string" ? (patchPaths(patch, env) ?? []) : [];
      break;
    }
    case "bash":
    case "exec":
    case "exec_command": {
      const key = call.toolName === "exec_command" ? "cmd" : "command";
      const command = call.input[key];
      if (typeof command === "string") {
        const detected = detectShell(command, env);
        operation.paths = detected.paths;
        operation.recursiveDeletes = detected.recursiveDeletes;
        operation.catastrophic = detected.catastrophic;
        operation.pushes = detected.pushes;
        operation.observations = detected.observations;
      } else operation.observations.push(`unsupported:${call.toolName}`);
      break;
    }
    default:
      operation.observations.push("unsupported:tool");
      return operation;
  }
  if (operation.paths.length === 0 && operation.observations.length === 0) {
    const commandKey = call.toolName === "exec_command" ? "cmd" : "command";
    const validEmpty =
      ["bash", "exec", "exec_command"].includes(call.toolName) &&
      typeof call.input[commandKey] === "string";
    if (!validEmpty)
      operation.observations.push(`unsupported:${call.toolName}`);
  }
  discoverDeletionRepositoryRoots(operation, env);
  return operation;
}
