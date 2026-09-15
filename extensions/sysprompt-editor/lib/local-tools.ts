/**
 * The `{{LOCAL_TOOLS}}` body: the `## Advertised` bullets of the machine's
 * system tools index, keeping only names found on PATH so an uninstalled
 * tool leaves the prompt without an edit. The index is untracked and
 * per-machine (`~/.agents/system-tools-index.md`); the template owns the
 * heading and the pointer to the full index.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface AdvertisedTool {
  name: string;
  line: string;
}

const HEADING = "## Advertised";
/** One bullet per tool, `- \`name\`: when to reach for it`, single line. */
const BULLET = /^- `([^`/\s]+)`: \S/;

export const DEFAULT_INDEX_PATH = path.join(
  os.homedir(),
  ".agents",
  "system-tools-index.md",
);

export function parseAdvertised(text: string): AdvertisedTool[] {
  const items: AdvertisedTool[] = [];
  let inSection = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) {
      inSection = line.trim() === HEADING;
      continue;
    }
    if (!inSection) continue;
    const match = BULLET.exec(line);
    if (match) items.push({ name: match[1], line: line.trimEnd() });
  }
  return items;
}

export function isOnPath(
  name: string,
  envPath = process.env.PATH ?? "",
): boolean {
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return true;
    } catch {
      // not here; try the next PATH entry
    }
  }
  return false;
}

export function renderLocalTools(
  items: AdvertisedTool[],
  onPath: (name: string) => boolean = isOnPath,
): string {
  return items
    .filter((item) => onPath(item.name))
    .map((item) => item.line)
    .join("\n");
}

/** Empty when the index or its `## Advertised` section is missing. */
export function readLocalTools(indexPath = DEFAULT_INDEX_PATH): string {
  let text: string;
  try {
    text = fs.readFileSync(indexPath, "utf8");
  } catch {
    return "";
  }
  return renderLocalTools(parseAdvertised(text));
}
