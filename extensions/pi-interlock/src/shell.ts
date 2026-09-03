import { isAbsolute } from "node:path";

import type {
  NormalizeEnv,
  PathAccess,
  PushShape,
  RecursiveDelete,
  RuleId,
} from "./contracts.ts";
import { readGitState, type GitState } from "./git.ts";
import { canonicalizePath } from "./paths.ts";

export interface ShellResult {
  paths: PathAccess[];
  recursiveDeletes: RecursiveDelete[];
  catastrophic: RuleId[];
  pushes: PushShape[];
  observations: string[];
}

interface WordToken {
  kind: "word";
  value: string;
  expansion: boolean;
  unquotedGlob: boolean;
}

type Token = WordToken | { kind: "redirect"; value: "<" | ">" | ">>" | "<>" };

export const MAX_PUSH_STATE_DIRECTORIES = 8;

function tokenize(command: string): Token[] | undefined {
  const tokens: Token[] = [];
  let word = "";
  let expansion = false;
  let unquotedGlob = false;
  let quote: "'" | '"' | undefined;
  const flush = (): void => {
    if (word.length === 0) return;
    tokens.push({ kind: "word", value: word, expansion, unquotedGlob });
    word = "";
    expansion = false;
    unquotedGlob = false;
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else if (char === "\\" && quote === '"' && index + 1 < command.length) {
        const escaped = command[++index]!;
        if (escaped !== "\n") word += escaped;
      } else {
        if (char === "$" && quote === '"') {
          if (command[index + 1] === "(") return undefined;
          expansion = true;
        }
        word += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "\\" && index + 1 < command.length) {
      const escaped = command[++index]!;
      if (escaped !== "\n") word += escaped;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (char === "$" && command[index + 1] === "(") return undefined;
    if (char === "$") {
      expansion = true;
      word += char;
      continue;
    }
    if (char === "*" || char === "?" || char === "[") unquotedGlob = true;
    if (char === "|" || char === ";" || char === "&" || char === "`")
      return undefined;
    if (char === "<" || char === ">") {
      flush();
      const pair = command.slice(index, index + 2);
      if (pair === ">>" || pair === "<>") {
        tokens.push({ kind: "redirect", value: pair });
        index += 1;
      } else tokens.push({ kind: "redirect", value: char });
      continue;
    }
    word += char;
  }
  if (quote !== undefined) return undefined;
  flush();
  return tokens;
}

function access(
  value: string,
  kind: PathAccess["access"],
  source: string,
  env: NormalizeEnv,
  unresolvedGlob = false,
): PathAccess {
  return {
    path: canonicalizePath(value, env.cwd, env.home),
    access: kind,
    source,
    ...(unresolvedGlob ? { unresolvedGlob: true as const } : {}),
  };
}

function accessWord(
  word: WordToken,
  kind: PathAccess["access"],
  source: string,
  env: NormalizeEnv,
): PathAccess {
  return access(word.value, kind, source, env, word.unquotedGlob);
}

function directOperands(
  executable: string,
  args: WordToken[],
  env: NormalizeEnv,
): { paths: PathAccess[]; supported: boolean } {
  const noOptions = (values: WordToken[]): WordToken[] | undefined => {
    if (values[0]?.value === "--") return values.slice(1);
    return values.some((value) => value.value.startsWith("-"))
      ? undefined
      : values;
  };
  const simpleReads = new Set([
    "cat",
    "head",
    "tail",
    "less",
    "more",
    "wc",
    "file",
    "stat",
    "jq",
    "ls",
  ]);
  if (simpleReads.has(executable)) {
    const operands = noOptions(args);
    return operands === undefined
      ? { paths: [], supported: false }
      : {
          paths: operands.map((word, index) =>
            accessWord(word, "read", `arg.${index}`, env),
          ),
          supported: true,
        };
  }
  if (executable === "grep" || executable === "rg") {
    const operands = noOptions(args);
    return operands === undefined || operands.length === 0
      ? { paths: [], supported: false }
      : {
          paths: [
            accessWord(
              operands.at(-1)!,
              "read",
              `arg.${operands.length - 1}`,
              env,
            ),
          ],
          supported: true,
        };
  }
  if (executable === "cmp" || executable === "diff") {
    const operands = noOptions(args);
    if (operands?.length !== 2) return { paths: [], supported: false };
    return {
      paths: operands.map((word, index) =>
        accessWord(word, "read", `arg.${index}`, env),
      ),
      supported: true,
    };
  }
  if (executable === "cp" || executable === "mv") {
    const operands = noOptions(args);
    if (operands?.length !== 2) return { paths: [], supported: false };
    return {
      paths: [
        accessWord(
          operands[0]!,
          executable === "cp" ? "read" : "move",
          "arg.0",
          env,
        ),
        accessWord(operands[1]!, "replace", "arg.1", env),
      ],
      supported: true,
    };
  }
  if (executable === "find") {
    const expressionIndex = args.findIndex((word) =>
      word.value.startsWith("-"),
    );
    const roots =
      expressionIndex === 0
        ? args[0]?.value === "-delete"
          ? [
              {
                kind: "word" as const,
                value: ".",
                expansion: false,
                unquotedGlob: false,
              },
            ]
          : undefined
        : args.slice(0, expressionIndex === -1 ? undefined : expressionIndex);
    if (roots === undefined) return { paths: [], supported: false };
    const effectiveRoots =
      roots.length === 0
        ? [
            {
              kind: "word" as const,
              value: ".",
              expansion: false,
              unquotedGlob: false,
            },
          ]
        : roots;
    return {
      paths: effectiveRoots.map((word) =>
        accessWord(word, "read", "find.root", env),
      ),
      supported: true,
    };
  }
  if (executable === "mkdir" || executable === "touch") {
    const operands = noOptions(args);
    return operands === undefined
      ? { paths: [], supported: false }
      : {
          paths: operands.map((word, index) =>
            accessWord(word, "create", `arg.${index}`, env),
          ),
          supported: true,
        };
  }
  if (executable === "chmod" || executable === "chown") {
    const operands = noOptions(args);
    if (operands === undefined || operands.length < 2)
      return { paths: [], supported: false };
    return {
      paths: operands
        .slice(1)
        .map((word, index) =>
          accessWord(word, "edit", `arg.${index + 1}`, env),
        ),
      supported: true,
    };
  }
  if (executable === "rm") {
    const parsed = parseRm(args);
    if (parsed === undefined) return { paths: [], supported: false };
    return {
      paths: parsed.targets.map((target, index) =>
        accessWord(target, "delete", `arg.${index}`, env),
      ),
      supported: true,
    };
  }
  return { paths: [], supported: true };
}

interface RmParse {
  recursive: boolean;
  targets: WordToken[];
}

function parseRm(args: WordToken[]): RmParse | undefined {
  let recursive = false;
  let ended = false;
  const targets: WordToken[] = [];
  for (const word of args) {
    const value = word.value;
    if (!ended && value === "--") {
      ended = true;
      continue;
    }
    if (!ended && value.startsWith("-")) {
      if (value === "--recursive") recursive = true;
      else if (value === "--force") continue;
      else if (/^-[fFiIvRr]+$/.test(value)) {
        if (/[rR]/.test(value)) recursive = true;
      } else return undefined;
      continue;
    }
    targets.push(word);
  }
  return { recursive, targets };
}

function expandKnownVariables(
  word: WordToken,
  env: NormalizeEnv,
): string | undefined {
  if (word.unquotedGlob) return undefined;
  if (!word.expansion) return word.value;
  const known: Record<string, string | undefined> = {
    HOME: env.home,
    TMPDIR: env.tmpdir,
    PI_SCRATCHPAD: env.scratchpad,
  };
  let unresolved = false;
  const value = word.value.replace(
    /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,
    (match, braced: string | undefined, plain: string | undefined) => {
      const replacement = known[braced ?? plain ?? ""];
      if (replacement === undefined) {
        unresolved = true;
        return match;
      }
      return replacement;
    },
  );
  return unresolved || value.includes("$") ? undefined : value;
}

const FIND_EXPRESSION_STARTS = new Set([
  "!",
  "(",
  "-a",
  "-amin",
  "-and",
  "-atime",
  "-cmin",
  "-ctime",
  "-delete",
  "-empty",
  "-exec",
  "-execdir",
  "-executable",
  "-false",
  "-fprintf",
  "-fstype",
  "-gid",
  "-group",
  "-ilname",
  "-iname",
  "-inum",
  "-ipath",
  "-iregex",
  "-links",
  "-lname",
  "-ls",
  "-maxdepth",
  "-mindepth",
  "-mmin",
  "-mount",
  "-mtime",
  "-name",
  "-newer",
  "-nogroup",
  "-not",
  "-nouser",
  "-o",
  "-ok",
  "-okdir",
  "-or",
  "-path",
  "-perm",
  "-print",
  "-print0",
  "-printf",
  "-prune",
  "-quit",
  "-readable",
  "-regex",
  "-samefile",
  "-size",
  "-true",
  "-type",
  "-uid",
  "-user",
  "-wholename",
  "-writable",
  "-xdev",
  "-xtype",
]);

function findDeletionRoots(args: WordToken[]): WordToken[] | undefined {
  const expressionIndex = args.findIndex((word) => word.value.startsWith("-"));
  if (expressionIndex === -1) return [];
  if (expressionIndex > 0) return args.slice(0, expressionIndex);
  return FIND_EXPRESSION_STARTS.has(args[0]!.value)
    ? [
        {
          kind: "word",
          value: ".",
          expansion: false,
          unquotedGlob: false,
        },
      ]
    : undefined;
}

function recursiveDelete(
  targets: WordToken[],
  source: string,
  env: NormalizeEnv,
): { shape: RecursiveDelete; paths: PathAccess[]; rootGlob: boolean } {
  const literalTargets: string[] = [];
  const unresolvedTargets: string[] = [];
  const paths: PathAccess[] = [];
  let rootGlob = false;
  for (const [index, target] of targets.entries()) {
    if (target.value === "/*" && target.unquotedGlob && !target.expansion) {
      unresolvedTargets.push(target.value);
      rootGlob = true;
      continue;
    }
    const literal = expandKnownVariables(target, env);
    if (literal === undefined) {
      unresolvedTargets.push(target.value);
      continue;
    }
    const canonical = canonicalizePath(literal, env.cwd, env.home);
    literalTargets.push(canonical);
    paths.push({ path: canonical, access: "delete", source: `arg.${index}` });
  }
  return {
    shape: { targets: literalTargets, unresolvedTargets, source },
    paths,
    rootGlob,
  };
}

function catastrophe(
  executable: string,
  args: WordToken[],
): RuleId | undefined {
  if (executable === "mkfs" || executable.startsWith("mkfs."))
    return "catastrophic.filesystem-format";
  if (executable === "wipefs") return "catastrophic.filesystem-format";
  if (executable !== "dd") return undefined;
  const excluded = new Set([
    "null",
    "zero",
    "random",
    "urandom",
    "stdin",
    "stdout",
    "stderr",
  ]);
  for (const arg of args) {
    const match = /^of=\/dev\/(.+)$/.exec(arg.value);
    if (match === null) continue;
    const name = match[1]!;
    if (!excluded.has(name) && !name.startsWith("fd/"))
      return "catastrophic.raw-device";
  }
  return undefined;
}

function destinationRef(value: string): string | undefined {
  if (value.length === 0) return undefined;
  if (value.startsWith("refs/heads/")) return value;
  if (value.startsWith("refs/")) return value;
  return `refs/heads/${value}`;
}

function configuredDestination(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.startsWith("refs/heads/")) return value;
  const slash = value.indexOf("/");
  return destinationRef(slash === -1 ? value : value.slice(slash + 1));
}

function detectPush(
  args: WordToken[],
  env: NormalizeEnv,
  gitState: (cwd: string) => GitState,
): { push: PushShape; observations: string[] } | { unsupported: true } {
  let index = 0;
  let cwd = env.cwd;
  while (args[index]?.value === "-C") {
    const directory = args[index + 1];
    if (directory === undefined) return { unsupported: true };
    cwd = canonicalizePath(directory.value, cwd, env.home);
    index += 2;
  }
  if (args[index]?.value !== "push") return { unsupported: true };
  index += 1;

  let force = false;
  let bulk: PushShape["bulk"] = "none";
  let optionRemote: string | undefined;
  let unsupported = false;
  while (index < args.length && args[index]!.value.startsWith("-")) {
    const option = args[index]!.value;
    if (
      option === "-f" ||
      option === "--force" ||
      option === "--force-with-lease" ||
      option.startsWith("--force-with-lease=")
    )
      force = true;
    else if (option === "--mirror") bulk = "mirror";
    else if (option === "--all") bulk = "all";
    else if (
      new Set([
        "-u",
        "--set-upstream",
        "--dry-run",
        "--atomic",
        "--porcelain",
        "--quiet",
        "--verbose",
        "--follow-tags",
        "--tags",
        "--prune",
        "--delete",
        "--no-verify",
      ]).has(option)
    ) {
      // Supported flag with no value.
    } else if (/^--(?:repo|receive-pack|exec)=.+$/.test(option)) {
      if (option.startsWith("--repo=")) optionRemote = option.slice(7);
    } else if (new Set(["--repo", "--receive-pack", "--exec"]).has(option)) {
      const value = args[++index]?.value;
      if (value === undefined) unsupported = true;
      else if (option === "--repo") optionRemote = value;
    } else unsupported = true;
    index += 1;
    if (unsupported) break;
  }
  if (unsupported && !force && bulk === "none") return { unsupported: true };

  const operands = unsupported
    ? []
    : args.slice(index).map((word) => word.value);
  const remote = optionRemote ?? operands[0];
  const refspecs = optionRemote === undefined ? operands.slice(1) : operands;
  const destinations: string[] = [];
  for (const refspec of refspecs) {
    const raw = refspec.startsWith("+") ? refspec.slice(1) : refspec;
    if (refspec.startsWith("+")) force = true;
    const colon = raw.indexOf(":");
    const source = colon === -1 ? raw : raw.slice(0, colon);
    const destination = colon === -1 ? source : raw.slice(colon + 1);
    if (colon === -1 && source === "HEAD") continue;
    const normalized = destinationRef(destination);
    if (normalized !== undefined) destinations.push(normalized);
  }

  const state = gitState(cwd);
  const currentBranch = state.currentBranch;
  const needsResolvedDestination =
    bulk === "none" &&
    (refspecs.length === 0 || refspecs.some((refspec) => refspec === "HEAD"));
  const resolved = needsResolvedDestination
    ? (configuredDestination(state.pushDestination) ??
      (refspecs.length === 0 ? destinationRef(currentBranch ?? "") : undefined))
    : undefined;
  const push: PushShape = {
    cwd,
    ...(remote === undefined ? {} : { remote }),
    refspecs,
    destinations,
    resolvedDestinations: resolved === undefined ? [] : [resolved],
    force,
    bulk,
    ...(currentBranch === undefined ? {} : { currentBranch }),
    stateResolved: state.stateResolved,
  };
  return {
    push,
    observations: state.stateResolved ? [] : ["git-state-unresolved"],
  };
}

function emptyResult(): ShellResult {
  return {
    paths: [],
    recursiveDeletes: [],
    catastrophic: [],
    pushes: [],
    observations: [],
  };
}

function detectSegment(
  command: string,
  env: NormalizeEnv,
  gitState: (cwd: string) => GitState,
): ShellResult {
  const result = emptyResult();
  if (command.includes("<<")) {
    result.observations.push("unsupported:shell");
    return result;
  }
  const tokens = tokenize(command);
  if (tokens === undefined) {
    result.observations.push("unsupported:shell");
    return result;
  }
  const words: WordToken[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.kind === "word") {
      words.push(token);
      continue;
    }
    const target = tokens[index + 1];
    if (target?.kind !== "word") {
      result.observations.push("unsupported:redirect");
      return result;
    }
    if (target.value === "/dev/null") {
      index += 1;
      continue;
    }
    result.paths.push(
      access(
        target.value,
        token.value === "<"
          ? "read"
          : token.value === ">"
            ? "truncate"
            : token.value === ">>"
              ? "append"
              : "edit",
        token.value === "<"
          ? "redirect.in"
          : token.value === ">"
            ? "redirect.out"
            : token.value === ">>"
              ? "redirect.append"
              : "redirect.edit",
        env,
        target.unquotedGlob,
      ),
    );
    index += 1;
  }
  if (words.length === 0) return result;
  const executableWord = words[0]!.value;
  const executable = executableWord.split("/").at(-1)!;
  const args = words.slice(1);
  if (isAbsolute(executableWord) || executableWord.includes("/"))
    result.paths.unshift(
      access(
        executableWord,
        "execute",
        "executable",
        env,
        words[0]!.unquotedGlob,
      ),
    );

  if (executable === "git") {
    if (args.some((word) => word.expansion || word.unquotedGlob)) {
      result.observations.push("unsupported:git");
      return result;
    }
    const detected = detectPush(args, env, gitState);
    if ("unsupported" in detected) result.observations.push("unsupported:git");
    else {
      result.pushes.push(detected.push);
      result.observations.push(...detected.observations);
    }
    return result;
  }

  const catastropheFamily =
    executable === "dd" ||
    executable === "wipefs" ||
    executable === "mkfs" ||
    executable.startsWith("mkfs.");
  if (
    catastropheFamily &&
    args.some((word) => word.expansion || word.unquotedGlob)
  ) {
    result.observations.push(`unsupported:${executable}`);
    return result;
  }
  const catastrophic = catastrophe(executable, args);
  if (catastrophic !== undefined) {
    result.catastrophic.push(catastrophic);
    return result;
  }

  if (executable === "rm") {
    const parsed = parseRm(args);
    if (parsed === undefined) {
      result.observations.push("unsupported:rm");
      return result;
    }
    if (parsed.recursive) {
      const detected = recursiveDelete(parsed.targets, "rm", env);
      result.paths.push(...detected.paths);
      result.recursiveDeletes.push(detected.shape);
      if (
        detected.rootGlob ||
        detected.shape.targets.some((target) => target === "/")
      )
        result.catastrophic.push("catastrophic.root-recursive");
      else if (detected.shape.unresolvedTargets.length > 0)
        result.observations.push("unresolved-delete-target");
      return result;
    }
  }

  if (executable === "find") {
    const hasDelete = args.some((word) => word.value === "-delete");
    const roots = findDeletionRoots(args);
    if (hasDelete && roots === undefined) {
      result.observations.push("unsupported:find");
      return result;
    }
    if (roots !== undefined && hasDelete) {
      const detected = recursiveDelete(
        roots.length === 0
          ? [
              {
                kind: "word",
                value: ".",
                expansion: false,
                unquotedGlob: false,
              },
            ]
          : roots,
        "find",
        env,
      );
      result.paths.push(
        ...detected.shape.targets.map((path) => ({
          path,
          access: "read" as const,
          source: "find.root",
        })),
      );
      result.recursiveDeletes.push(detected.shape);
      if (detected.shape.unresolvedTargets.length > 0)
        result.observations.push("unresolved-delete-target");
      return result;
    }
  }

  const direct = directOperands(executable, args, env);
  result.paths.push(...direct.paths);
  if (!direct.supported) result.observations.push(`unsupported:${executable}`);
  return result;
}

interface HeredocSpec {
  delimiter: string;
  stripTabs: boolean;
}

function heredocSpec(segment: string): HeredocSpec | null | undefined {
  let quote: "'" | '"' | undefined;
  for (let index = 0; index < segment.length - 1; index += 1) {
    const char = segment[index]!;
    if (quote !== undefined) {
      if (char === "\\" && quote === '"') index += 1;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char !== "<" || segment[index + 1] !== "<") continue;
    index += 2;
    const stripTabs = segment[index] === "-";
    if (stripTabs) index += 1;
    while (index < segment.length && /[ \t]/.test(segment[index]!)) index += 1;
    if (index >= segment.length || segment[index] === "<") return null;
    let delimiterQuote: "'" | '"' | undefined;
    if (segment[index] === "'" || segment[index] === '"')
      delimiterQuote = segment[index++] as "'" | '"';
    const start = index;
    while (
      index < segment.length &&
      (delimiterQuote !== undefined
        ? segment[index] !== delimiterQuote
        : !/\s/.test(segment[index]!))
    )
      index += 1;
    const delimiter = segment.slice(start, index);
    if (
      delimiter.length === 0 ||
      (delimiterQuote !== undefined && segment[index] !== delimiterQuote)
    )
      return null;
    return { delimiter, stripTabs };
  }
  return undefined;
}

function topLevelSegments(command: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let quote: "'" | '"' | undefined;
  let substitutionDepth = 0;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;
    if (quote !== undefined) {
      if (char === "\\" && quote === '"') index += 1;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "$" && command[index + 1] === "(") {
      substitutionDepth += 1;
      index += 1;
      continue;
    }
    if (char === ")" && substitutionDepth > 0) {
      substitutionDepth -= 1;
      continue;
    }
    if (substitutionDepth > 0) continue;
    const pair = command.slice(index, index + 2);
    if (char === "\n") {
      const spec = heredocSpec(command.slice(start, index));
      if (spec !== undefined) {
        if (spec === null) {
          segments.push(command.slice(start));
          return segments;
        }
        let lineStart = index + 1;
        for (;;) {
          const lineEnd = command.indexOf("\n", lineStart);
          const end = lineEnd === -1 ? command.length : lineEnd;
          const line = command.slice(lineStart, end);
          const candidate = spec.stripTabs ? line.replace(/^\t+/, "") : line;
          if (candidate === spec.delimiter) {
            segments.push(command.slice(start, end));
            index = end;
            start = end + (lineEnd === -1 ? 0 : 1);
            break;
          }
          if (lineEnd === -1) {
            segments.push(command.slice(start));
            return segments;
          }
          lineStart = lineEnd + 1;
        }
        continue;
      }
    }
    if (char === ";" || char === "\n" || pair === "&&" || pair === "||") {
      segments.push(command.slice(start, index));
      index += pair === "&&" || pair === "||" ? 1 : 0;
      start = index + 1;
    }
  }
  segments.push(command.slice(start));
  return segments;
}

export function detectShell(command: string, env: NormalizeEnv): ShellResult {
  const result = emptyResult();
  if (command.trim().replace(/\s+/g, " ") === ":(){ :|:& };:") {
    result.catastrophic.push("catastrophic.fork-bomb");
    return result;
  }
  const gitStates = new Map<string, GitState>();
  let gitStateDirectories = 0;
  const stateFor = (directory: string): GitState => {
    const cached = gitStates.get(directory);
    if (cached !== undefined) return cached;
    if (gitStateDirectories >= MAX_PUSH_STATE_DIRECTORIES)
      return { stateResolved: false };
    gitStateDirectories += 1;
    const state = readGitState(directory, env.gitRunner);
    gitStates.set(directory, state);
    return state;
  };
  let cwd = env.cwd;
  for (const rawSegment of topLevelSegments(command)) {
    const segment = rawSegment.trim();
    if (segment.length === 0) continue;
    const cdTokens = tokenize(segment);
    const cdWords = cdTokens?.every((token) => token.kind === "word")
      ? cdTokens.map((token) => token.value)
      : undefined;
    if (
      cdWords !== undefined &&
      cdWords[0] === "cd" &&
      (cdWords.length === 2 || (cdWords.length === 3 && cdWords[1] === "--"))
    ) {
      cwd = canonicalizePath(cdWords.at(-1)!, cwd, env.home);
      continue;
    }
    const detected = detectSegment(segment, { ...env, cwd }, stateFor);
    result.paths.push(...detected.paths);
    result.recursiveDeletes.push(...detected.recursiveDeletes);
    result.catastrophic.push(...detected.catastrophic);
    result.pushes.push(...detected.pushes);
    result.observations.push(...detected.observations);
  }
  return result;
}
