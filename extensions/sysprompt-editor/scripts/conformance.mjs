#!/usr/bin/env node
// Runs the cross-repository contract against a source checkout, never installed JS.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const source = process.env.PI_SOURCE_DIR;
if (!source)
  throw new Error(
    "Set PI_SOURCE_DIR to the patched Pi v0.85.0 checkout (see README.md).",
  );
const pi = resolve(source);
const root = fileURLToPath(new URL("../", import.meta.url));
const temp = mkdtempSync(resolve(tmpdir(), "sysprompt-conformance-"));
const config = resolve(temp, "vitest.config.mjs");
writeFileSync(
  config,
  `import base from ${JSON.stringify(pathToFileURL(resolve(pi, "vitest.base.ts")).href)};
export default {
  ...base,
  root: ${JSON.stringify(root)},
  resolve: { alias: [
    ...base.resolve.alias,
    { find: "@pi-source", replacement: ${JSON.stringify(pi)} },
    { find: "vitest", replacement: ${JSON.stringify(resolve(pi, "node_modules/vitest/dist/index.js"))} },
    { find: "@earendil-works/pi-coding-agent", replacement: ${JSON.stringify(resolve(pi, "packages/coding-agent/src/index.ts"))} }
  ] },
  test: { include: ["conformance/**/*.test.ts"], testTimeout: 30000, fileParallelism: false }
};
`,
);
try {
  const result = spawnSync(
    process.execPath,
    [resolve(pi, "node_modules/vitest/vitest.mjs"), "run", "--config", config],
    { cwd: pi, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
