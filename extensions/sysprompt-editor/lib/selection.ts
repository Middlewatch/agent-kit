import { readActiveTemplate, validTemplateName } from "./templates.ts";

export const SELECTION_TYPE = "sysprompt-editor:selection";
export interface SavedSelection {
  version: 1;
  name: string;
}
export type Selection =
  | { kind: "none" }
  | { kind: "selected"; name: string }
  | { kind: "invalid"; reason: string };

/** Restore only the active branch. A malformed newest entry cannot reveal an older pin. */
export function restoreSelection(
  entries: readonly { type: string; customType?: string; data?: unknown }[],
): Selection {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (entry.type !== "custom" || entry.customType !== SELECTION_TYPE)
      continue;
    const data = entry.data;
    if (
      data &&
      typeof data === "object" &&
      "version" in data &&
      data.version === 1 &&
      "name" in data &&
      typeof data.name === "string" &&
      validTemplateName(data.name)
    ) {
      return { kind: "selected", name: data.name };
    }
    return { kind: "invalid", reason: "malformed saved template selection" };
  }
  return { kind: "none" };
}

export function saveSelection(
  name: string,
  append: (type: string, data: SavedSelection) => void,
): void {
  if (!validTemplateName(name))
    throw new Error("invalid template filename (use [a-z0-9-]+.md)");
  append(SELECTION_TYPE, { version: 1, name });
}

/** The pointer is read only until a branch has a saved selection. */
export function initializeSelection(
  selection: Selection,
  dir: string,
  append: (type: string, data: SavedSelection) => void,
): Exclude<Selection, { kind: "none" }> {
  if (selection.kind !== "none") return selection;
  const initial = readActiveTemplate(dir);
  if (!initial)
    return { kind: "invalid", reason: "no initial template available" };
  try {
    saveSelection(initial.name, append);
    return { kind: "selected", name: initial.name };
  } catch (error) {
    return {
      kind: "invalid",
      reason: `initial selection could not be saved: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
