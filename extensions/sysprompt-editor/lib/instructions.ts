/** Pi's scoped context wire contract. Kept pure and checked against its real loader. */
export interface InstructionFile {
  path: string;
  content: string;
  scope?: { kind: "global" } | { kind: "workspace"; directory: string };
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
    file.scope?.kind === "global"
      ? "global_instructions"
      : "workspace_instructions";
  const directory =
    file.scope?.kind === "workspace"
      ? ` directory="${attribute(file.scope.directory)}"`
      : "";
  return `<${tag} path="${attribute(file.path)}"${directory}>\n${file.content}\n</${tag}>`;
}

function instructionContext(files: InstructionFile[]): string {
  if (files.length === 0) return "";
  return `\n\n<instruction_context>\n\nGlobal instructions apply across workspaces. Workspace instructions apply within their named directory; deeper workspace instructions take precedence for files in their scope.\n\n${files.map(instructionBlock).join("\n\n")}\n\n</instruction_context>`;
}

export type Instructions = {
  global: string;
  workspace: string;
  fallback: string;
  rest: string;
};

/** Remove the known container before scanning anything inside the remaining tail. */
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
  if (
    files.some(
      (file) =>
        !file.scope ||
        (file.scope.kind !== "global" &&
          (file.scope.kind !== "workspace" ||
            typeof file.scope.directory !== "string")),
    )
  )
    return null;
  const context = instructionContext(files);
  if (!tail.startsWith(context)) return null;
  const rest = tail.slice(context.length);
  // A missing/unknown provenance contract is a fallback, even with an old template.
  if (
    rest.includes("<instruction_context>") ||
    rest.includes("<project_context>")
  )
    return null;
  const globals = files.filter((file) => file.scope?.kind === "global");
  const workspaces = files.filter((file) => file.scope?.kind === "workspace");
  const fallback = files.filter(
    (file) =>
      !template.includes(
        file.scope?.kind === "global" ? globalSlot : workspaceSlot,
      ),
  );
  return {
    global: globals.map(instructionBlock).join("\n\n"),
    workspace: workspaces.map(instructionBlock).join("\n\n"),
    fallback: instructionContext(fallback),
    rest,
  };
}
