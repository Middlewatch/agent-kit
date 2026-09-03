/**
 * Template store: the templates directory holds `*.md` templates and a
 * gitignored one-line `.active` pointer naming the selected file. Every
 * function takes the templates directory as its first argument; the caller
 * supplies the real path or a temp dir.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_TEMPLATE = "default.md";
const POINTER_FILE = ".active";
const VALID_POINTER = /^[a-z0-9-]+\.md$/;

/**
 * Templates in the directory: the resolved active template first (the one
 * the splice would actually use), then the rest alphabetically. Only files
 * whose names the pointer grammar accepts are listed, so every listed name
 * can become active.
 */
export function listTemplates(dir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = entries
    .filter((e) => e.isFile() && VALID_POINTER.test(e.name))
    .map((e) => e.name)
    .sort();
  const active = readActiveTemplate(dir)?.name;
  if (active !== undefined) {
    const i = names.indexOf(active);
    if (i > 0) {
      names.splice(i, 1);
      names.unshift(active);
    }
  }
  return names;
}

/** The pointer file's content when it is a valid template filename, else null. */
function readPointer(dir: string): string | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(dir, POINTER_FILE), "utf8");
  } catch {
    return null;
  }
  const name = raw.trim();
  return VALID_POINTER.test(name) ? name : null;
}

/**
 * Resolve the active template: a valid pointer naming an existing file, else
 * default.md, else null (the caller fails open to the stock prompt).
 */
export function readActiveTemplate(
  dir: string,
): { name: string; content: string } | null {
  const candidates = [readPointer(dir), DEFAULT_TEMPLATE].filter(
    (n): n is string => n !== null,
  );
  for (const name of candidates) {
    try {
      return { name, content: fs.readFileSync(path.join(dir, name), "utf8") };
    } catch {
      // fall through to the next candidate
    }
  }
  return null;
}

/**
 * Write the pointer file naming `name`. The write goes to a temp file in the
 * same directory and is renamed over `.active`, so a concurrent reader sees
 * either the old pointer or the new one, never a truncated file. Concurrent
 * switches are last-writer-wins.
 */
export function setActiveTemplate(dir: string, name: string): void {
  const target = path.join(dir, POINTER_FILE);
  const tmp = path.join(
    dir,
    `${POINTER_FILE}.${process.pid}.${Date.now()}.tmp`,
  );
  fs.writeFileSync(tmp, name + "\n", "utf8");
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // nothing to clean
    }
    throw err;
  }
}

const VALID_NAME = /^[a-z0-9-]+$/;

/**
 * Create `<dir>/<name>.md` holding `content` (the active template's bytes,
 * supplied by the caller). Returns the created path, or an Error when the
 * name is invalid or the file already exists; never overwrites.
 */
export function scaffoldTemplate(
  dir: string,
  name: string,
  content: string,
): string | Error {
  if (!VALID_NAME.test(name)) {
    return new Error(`invalid template name "${name}" (use [a-z0-9-]+)`);
  }
  const target = path.join(dir, `${name}.md`);
  try {
    fs.writeFileSync(target, content, { encoding: "utf8", flag: "wx" });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return new Error(`${name}.md already exists`);
    return err instanceof Error ? err : new Error(String(err));
  }
  return target;
}
