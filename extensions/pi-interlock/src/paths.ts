import { lstatSync, readlinkSync } from "node:fs";
import { isAbsolute, join, parse, resolve, sep } from "node:path";

export class PathResolutionError extends Error {
  constructor(options?: ErrorOptions) {
    super("Path resolution failed", options);
    this.name = "PathResolutionError";
  }
}

function expandHome(path: string, home: string): string {
  if (path === "~" || path === "$HOME" || path === "${HOME}") return home;
  for (const prefix of ["~/", "$HOME/", "${HOME}/"]) {
    if (path.startsWith(prefix)) return join(home, path.slice(prefix.length));
  }
  return path;
}

export function lexicalizePath(
  path: string,
  cwd: string,
  home: string,
): string {
  const expanded = expandHome(path, home);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
}

export function canonicalizePath(
  path: string,
  cwd: string,
  home: string,
): string {
  try {
    let pendingPath = lexicalizePath(path, cwd, home);
    let linkCount = 0;

    for (;;) {
      const root = parse(pendingPath).root;
      const pending = pendingPath.slice(root.length).split(sep).filter(Boolean);
      let ancestor = root;
      let restarted = false;

      for (let index = 0; index < pending.length; index += 1) {
        const candidate = join(ancestor, pending[index]!);
        let stat;
        try {
          stat = lstatSync(candidate);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
          return resolve(candidate, ...pending.slice(index + 1));
        }

        if (!stat.isSymbolicLink()) {
          ancestor = candidate;
          continue;
        }

        linkCount += 1;
        if (linkCount > 40) throw new PathResolutionError();
        const target = readlinkSync(candidate);
        const targetPath = isAbsolute(target)
          ? target
          : resolve(ancestor, target);
        pendingPath = resolve(targetPath, ...pending.slice(index + 1));
        restarted = true;
        break;
      }

      if (!restarted) return resolve(ancestor);
    }
  } catch (error) {
    if (error instanceof PathResolutionError) throw error;
    throw new PathResolutionError({ cause: error });
  }
}

export function pathIsWithin(path: string, root: string): boolean {
  const normalizedPath = resolve(path);
  const normalizedRoot = resolve(root);
  if (normalizedPath === normalizedRoot) return true;
  const rootPrefix =
    normalizedRoot === parse(normalizedRoot).root
      ? normalizedRoot
      : `${normalizedRoot}${sep}`;
  return normalizedPath.startsWith(rootPrefix);
}

type GlobToken =
  | { kind: "literal"; value: string }
  | { kind: "single" }
  | { kind: "star" }
  | { kind: "class"; value: string; negated: boolean };

function globTokens(pattern: string): GlobToken[] {
  const tokens: GlobToken[] = [];
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!;
    if (character === "*") tokens.push({ kind: "star" });
    else if (character === "?") tokens.push({ kind: "single" });
    else if (character === "[") {
      const specialClose = [":]]", ".]]", "=]]"]
        .map((suffix) => pattern.indexOf(suffix, index + 2))
        .filter((position) => position !== -1)
        .sort((left, right) => left - right)[0];
      if (specialClose !== undefined) {
        tokens.push({ kind: "single" });
        index = specialClose + 2;
        continue;
      }
      let contentStart = index + 1;
      if (pattern[contentStart] === "!" || pattern[contentStart] === "^")
        contentStart += 1;
      if (pattern[contentStart] === "]") contentStart += 1;
      const close = pattern.indexOf("]", contentStart);
      if (close === -1) tokens.push({ kind: "literal", value: character });
      else {
        let value = pattern.slice(index + 1, close);
        const negated = value.startsWith("!") || value.startsWith("^");
        if (negated) value = value.slice(1);
        tokens.push({ kind: "class", value, negated });
        index = close;
      }
    } else tokens.push({ kind: "literal", value: character });
  }
  return tokens;
}

function classContains(expression: string, character: string): boolean {
  for (let index = 0; index < expression.length; index += 1) {
    const start = expression[index]!;
    if (index + 2 < expression.length && expression[index + 1] === "-") {
      const end = expression[index + 2]!;
      if (character >= start && character <= end) return true;
      index += 2;
    } else if (character === start) return true;
  }
  return false;
}

function tokenMatches(token: GlobToken, character: string): boolean {
  if (token.kind === "single") return true;
  if (token.kind === "literal") return token.value === character;
  if (token.kind === "class") {
    const contains = classContains(token.value, character);
    return token.negated ? !contains : contains;
  }
  return false;
}

function globSegmentMatches(pattern: string, value: string): boolean {
  if (value.startsWith(".") && !pattern.startsWith(".")) return false;
  const tokens = globTokens(pattern);
  let tokenIndex = 0;
  let valueIndex = 0;
  let starIndex = -1;
  let starValueIndex = 0;
  while (valueIndex < value.length) {
    const token = tokens[tokenIndex];
    if (token !== undefined && tokenMatches(token, value[valueIndex]!)) {
      tokenIndex += 1;
      valueIndex += 1;
    } else if (token?.kind === "star") {
      starIndex = tokenIndex;
      tokenIndex += 1;
      starValueIndex = valueIndex;
    } else if (starIndex !== -1) {
      tokenIndex = starIndex + 1;
      starValueIndex += 1;
      valueIndex = starValueIndex;
    } else return false;
  }
  while (tokens[tokenIndex]?.kind === "star") tokenIndex += 1;
  return tokenIndex === tokens.length;
}

export function pathPatternMayReach(
  pattern: string,
  root: string,
  kind: "exact" | "tree",
): boolean {
  const patternRoot = parse(pattern).root;
  const protectedRoot = parse(root).root;
  if (patternRoot !== protectedRoot) return false;
  const patternSegments = pattern
    .slice(patternRoot.length)
    .split(sep)
    .filter(Boolean);
  const rootSegments = root
    .slice(protectedRoot.length)
    .split(sep)
    .filter(Boolean);
  if (
    patternSegments.length < rootSegments.length ||
    (kind === "exact" && patternSegments.length !== rootSegments.length)
  )
    return false;
  return rootSegments.every((segment, index) =>
    globSegmentMatches(patternSegments[index]!, segment),
  );
}
