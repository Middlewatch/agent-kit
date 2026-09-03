export type Mode = "off" | "audit" | "shield";

export type Verdict = "allow" | "ask" | "deny";

export type Access =
  | "read"
  | "create"
  | "edit"
  | "append"
  | "truncate"
  | "replace"
  | "move"
  | "delete"
  | "execute"
  | "unknown";

export type RuleId =
  | "credential.direct-access"
  | "credential.audit-access"
  | "path.resolution-failed"
  | "catastrophic.root-recursive"
  | "catastrophic.raw-device"
  | "catastrophic.filesystem-format"
  | "catastrophic.fork-bomb"
  | "delete.boundary"
  | "push.protected-branch"
  | "push.force-or-bulk"
  | "default.allow";

export interface PathAccess {
  path: string;
  access: Access;
  source: string;
  unresolvedGlob?: true;
}

export interface RecursiveDelete {
  targets: string[];
  unresolvedTargets: string[];
  source: string;
}

export interface PushShape {
  cwd: string;
  remote?: string;
  refspecs: string[];
  destinations: string[];
  resolvedDestinations: string[];
  force: boolean;
  bulk: "none" | "all" | "mirror";
  currentBranch?: string;
  stateResolved: boolean;
}

export interface GitCommandResult {
  ok: boolean;
  stdout: string;
}

export type GitCommandRunner = (args: readonly string[]) => GitCommandResult;

export const operationFacts = Symbol("interlock.operationFacts");

export interface OperationFacts {
  home: string;
  repositoryRoots: string[];
}

export interface NormalizedOperation {
  tool: string;
  cwd: string;
  authorityRoot: string;
  paths: PathAccess[];
  recursiveDeletes: RecursiveDelete[];
  catastrophic: RuleId[];
  pushes: PushShape[];
  observations: string[];
  [operationFacts]?: OperationFacts;
}

export interface Decision {
  verdict: Verdict;
  ruleId: RuleId;
  reason: string;
  shadow?: { verdict: Verdict; ruleId: RuleId };
}

export interface ToolCallInput {
  toolName: string;
  input: Record<string, unknown>;
}

export interface NormalizeEnv {
  cwd: string;
  home: string;
  tmpdir?: string;
  scratchpad?: string;
  gitRunner?: GitCommandRunner;
}

export interface CredentialRoot {
  path: string;
  kind: "exact" | "tree";
  ruleId: "credential.direct-access" | "credential.audit-access";
}

export interface EffectiveConfig {
  mode: Mode;
  credentialRoots: CredentialRoot[];
  estateRoots: string[];
  ephemeralRoots: string[];
}

export type AuditPathToken =
  | "@credential"
  | "@home"
  | "@estate"
  | "@ephemeral"
  | "@authority"
  | "@outside";

export interface AuditShape {
  cwd: AuditPathToken;
  authority: AuditPathToken;
  paths: Array<{
    token: AuditPathToken;
    access: Access;
    source: "argument" | "redirect" | "patch" | "executable" | "tool";
  }>;
  recursiveDeletes: Array<{
    literalTokens: AuditPathToken[];
    unresolvedCount: number;
    source: "rm" | "find" | "tool.delete";
  }>;
  catastrophic: RuleId[];
  pushes: Array<{
    remotePresent: boolean;
    refspecCount: number;
    explicitProtectedDestination: boolean;
    resolvedProtectedDestination: boolean;
    currentBranchProtected: boolean;
    force: boolean;
    bulk: "none" | "all" | "mirror";
    stateResolved: boolean;
  }>;
  observations: string[];
}

export interface AuditRecordWithoutDigest {
  schemaVersion: 2;
  timestamp: string;
  mode: "audit" | "shield";
  tool: string;
  shape: AuditShape;
  publicVerdict: Verdict;
  publicRuleId: RuleId;
  shadowVerdict: Verdict | null;
  shadowRuleId: RuleId | null;
  enforcement: "shadow" | "enforced";
}

export interface AuditRecord extends AuditRecordWithoutDigest {
  digest: `sha256:${string}`;
}

export type ConfigDiagnostic =
  "interlock: invalid configuration" | "interlock: invalid environment";
