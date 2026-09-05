import type { CoreSource } from "./pi-contract.ts";
import { createHash } from "node:crypto";
import type { InstructionFile } from "./instructions.ts";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface PromptEvidence {
  coreSource: CoreSource;
  selectedName: string | null;
  renderedName: string | null;
  templateSha256: string | null;
  reason: string | null;
  instructions: {
    path: string;
    scope: string;
    directory?: string;
    sha256: string;
  }[];
  providerSystemSha256?: string;
  providerCapture?: string;
}

export function instructionInventory(
  files: InstructionFile[] = [],
): PromptEvidence["instructions"] {
  return files.map((file) => ({
    path: file.path,
    scope: file.scope.kind,
    ...(file.scope.kind === "workspace"
      ? { directory: file.scope.directory }
      : {}),
    sha256: sha256(file.content),
  }));
}

export function evidenceLines(evidence: PromptEvidence): string {
  return (
    [
      `- core-source: ${evidence.coreSource.kind}${evidence.coreSource.kind === "file" ? ` ${evidence.coreSource.path}` : ""}`,
      ...(evidence.providerCapture
        ? [`- provider-capture: ${evidence.providerCapture}`]
        : []),
      `- selected-template: ${evidence.selectedName ?? "(none)"}`,
      `- rendered-template: ${evidence.renderedName ?? "(incoming prompt)"}`,
      `- template-sha256: ${evidence.templateSha256 ?? "(unavailable)"}`,
      `- fallback-or-bypass: ${evidence.reason ?? "(none)"}`,
      ...(evidence.providerSystemSha256
        ? [`- provider-system-sha256: ${evidence.providerSystemSha256}`]
        : []),
      ...evidence.instructions.map(
        (file) =>
          `- instruction: ${file.scope} ${file.path}${file.directory ? ` directory=${file.directory}` : ""} sha256:${file.sha256}`,
      ),
    ].join("\n") + "\n"
  );
}
