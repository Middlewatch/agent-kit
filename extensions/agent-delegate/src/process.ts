import type { ChildProcess } from "node:child_process";

export interface ManagedChild {
  child: ChildProcess;
  closed: Promise<number>;
  exited: boolean;
  stopPromise?: Promise<void>;
}

function signalTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) throw new Error("child has no process id");
  if (process.platform === "win32") throw new Error("agent-delegate process-tree cleanup is supported only on POSIX hosts");
  try {
    process.kill(-child.pid, signal);
  } catch (groupError) {
    try {
      child.kill(signal);
    } catch (directError) {
      throw new Error(`cannot send ${signal} to child tree: ${String(groupError)}; direct signal: ${String(directError)}`);
    }
  }
}

export function processTreeExists(entry: ManagedChild): boolean {
  if (!entry.child.pid) return false;
  if (process.platform === "win32") return !entry.exited;
  try {
    process.kill(-entry.child.pid, 0);
    return true;
  } catch (error: any) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return true;
    throw error;
  }
}

export async function waitForProcessTreeExit(entry: ManagedChild, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (processTreeExists(entry)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(25, Math.max(1, deadline - Date.now()))));
  }
  return true;
}

export async function stopProcessTree(entry: ManagedChild, termGraceMs = 3000, killGraceMs = 2000): Promise<void> {
  if (!processTreeExists(entry)) return;
  if (entry.stopPromise) return entry.stopPromise;
  const operation = (async () => {
    let termError: unknown;
    try { signalTree(entry.child, "SIGTERM"); } catch (error) { termError = error; }
    if (await waitForProcessTreeExit(entry, termGraceMs)) return;
    let killError: unknown;
    try { signalTree(entry.child, "SIGKILL"); } catch (error) { killError = error; }
    if (await waitForProcessTreeExit(entry, killGraceMs)) return;
    throw new Error(`child ${entry.child.pid ?? "unknown"} remained alive after TERM/KILL; TERM=${String(termError ?? "sent")}; KILL=${String(killError ?? "sent")}`);
  })();
  entry.stopPromise = operation;
  try {
    await operation;
  } catch (error) {
    entry.stopPromise = undefined;
    throw error;
  }
}
