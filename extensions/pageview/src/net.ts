import { execFile } from "node:child_process";
import os from "node:os";

type IfaceEntry = { family: string; address: string; internal: boolean };
export type InterfaceMap = Record<string, IfaceEntry[] | undefined>;

/** Tailscale hands out addresses in the CGNAT block 100.64.0.0/10. */
function isCgnat(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return false;
  const [a, b] = octets;
  return a === 100 && b !== undefined && b >= 64 && b <= 127;
}

/**
 * Pick the tailnet IPv4 address from an interface map: only an interface
 * named tailscale* qualifies. A CGNAT-range address on any other interface
 * could be a carrier WAN, and binding that would leave the tailnet boundary,
 * so it falls through to the localhost fallback instead.
 */
export function pickTailscaleAddress(interfaces: InterfaceMap): string | undefined {
  for (const [name, entries] of Object.entries(interfaces)) {
    if (!name.startsWith("tailscale")) continue;
    const entry = entries?.find(
      (e) => e.family === "IPv4" && !e.internal && isCgnat(e.address),
    );
    if (entry) return entry.address;
  }
  return undefined;
}

function tailscaleCliAddress(timeoutMs: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile("tailscale", ["ip", "-4"], { timeout: timeoutMs }, (err, stdout) => {
      if (err) return resolve(undefined);
      const first = stdout.split("\n")[0]?.trim();
      resolve(first && isCgnat(first) ? first : undefined);
    });
  });
}

export interface BindTarget {
  host: string;
  /** False means the localhost fallback: no tailnet interface was found. */
  tailnet: boolean;
}

/**
 * Find the address to bind: `tailscale ip -4` first, interface scan second,
 * localhost last (still useful behind an SSH port-forward).
 */
export async function discoverBindHost(timeoutMs = 1500): Promise<BindTarget> {
  const cli = await tailscaleCliAddress(timeoutMs);
  if (cli) return { host: cli, tailnet: true };
  const scanned = pickTailscaleAddress(os.networkInterfaces() as InterfaceMap);
  if (scanned) return { host: scanned, tailnet: true };
  return { host: "127.0.0.1", tailnet: false };
}
