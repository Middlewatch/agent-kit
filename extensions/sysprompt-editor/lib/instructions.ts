/**
 * Scoped instruction rendering. Stock Pi appends loaded instruction files
 * as one `<project_context>` container that labels every file, global
 * included, as project instructions. The splice lifts that container out
 * of the tail (`lib/stock-core.ts` reproduces its exact bytes) and renders
 * each file once with its scope, either into a template slot or, for an
 * omitted slot, into an `<instruction_context>` container left in the tail.
 */
import { projectContext } from "./stock-core.ts";

export interface InstructionFile {
  path: string;
  content: string;
  scope: { kind: "global" } | { kind: "workspace"; directory: string };
}

function attribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function instructionBlock(file: InstructionFile): string {
  const tag =
    file.scope.kind === "global"
      ? "global_instructions"
      : "workspace_instructions";
  const directory =
    file.scope.kind === "workspace"
      ? ` directory="${attribute(file.scope.directory)}"`
      : "";
  return `<${tag} path="${attribute(file.path)}"${directory}>\n${file.content}\n</${tag}>`;
}

export function instructionContext(files: InstructionFile[]): string {
  if (files.length === 0) return "";
  return `\n\n<instruction_context>\n\nGlobal instructions apply across workspaces. Workspace instructions apply within their named directory; deeper workspace instructions take precedence for files in their scope.\n\n${files.map(instructionBlock).join("\n\n")}\n\n</instruction_context>`;
}

export type Instructions = {
  global: string;
  workspace: string;
  fallback: string;
  rest: string;
};

/** Remove the stock container before scanning anything inside the remaining tail. */
export function takeInstructions(
  tail: string,
  files: InstructionFile[],
  template: string,
): Instructions | null {
  const globalSlot = "{{GLOBAL_INSTRUCTIONS}}";
  const workspaceSlot = "{{WORKSPACE_INSTRUCTIONS}}";
  if (
    [globalSlot, workspaceSlot].some((slot) => template.split(slot).length > 2)
  )
    return null;
  const context = projectContext(files);
  if (!tail.startsWith(context)) return null;
  const rest = tail.slice(context.length);
  // A second container means the inputs and the prompt disagree.
  if (
    rest.includes("<instruction_context>") ||
    rest.includes("<project_context>")
  )
    return null;
  const globals = files.filter((file) => file.scope.kind === "global");
  const workspaces = files.filter((file) => file.scope.kind === "workspace");
  const fallback = files.filter(
    (file) =>
      !template.includes(
        file.scope.kind === "global" ? globalSlot : workspaceSlot,
      ),
  );
  return {
    global: globals.map(instructionBlock).join("\n\n"),
    workspace: workspaces.map(instructionBlock).join("\n\n"),
    fallback: instructionContext(fallback),
    rest,
  };
}
