import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { loadConfig, saveUserMode } from "../src/config.ts";
import type { ConfigDiagnostic } from "../src/contracts.ts";

function fixture(): { root: string; home: string; agentDir: string } {
  const root = mkdtempSync(join(tmpdir(), "interlock-config-"));
  const home = join(root, "home");
  const agentDir = join(root, "agent");
  mkdirSync(home);
  mkdirSync(agentDir);
  return { root, home, agentDir };
}

test("absent configuration defaults to built-ins in audit", () => {
  const f = fixture();
  try {
    const config = loadConfig({ agentDir: f.agentDir, home: f.home });
    assert.equal(config.mode, "audit");
    assert.equal(config.credentialRoots.length, 14);
    assert.equal(config.estateRoots.length, 10);
    assert(config.ephemeralRoots.includes(join(f.home, ".cache")));
    assert(
      config.credentialRoots.some(
        (root) =>
          root.path === join(f.agentDir, "auth.json") && root.kind === "exact",
      ),
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("valid user roots append and process mode has final authority", () => {
  const f = fixture();
  try {
    const custom = join(f.root, "custom");
    writeFileSync(
      join(f.agentDir, "interlock.json"),
      JSON.stringify({
        schemaVersion: 2,
        mode: "off",
        credentialPaths: [custom, custom],
        estateRoots: ["~/durable"],
        ephemeralRoots: [join(f.root, "scratch")],
      }),
    );
    const config = loadConfig({
      agentDir: f.agentDir,
      home: f.home,
      processMode: "shield",
    });
    assert.equal(config.mode, "shield");
    assert.equal(
      config.credentialRoots.filter((root) => root.path === custom).length,
      1,
    );
    assert(config.estateRoots.includes(join(f.home, "durable")));
    assert(config.ephemeralRoots.includes(join(f.root, "scratch")));
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("saving a mode creates a private atomic global configuration", () => {
  const f = fixture();
  try {
    saveUserMode({ agentDir: f.agentDir, home: f.home }, "shield");
    const path = join(f.agentDir, "interlock.json");
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
      schemaVersion: 2,
      mode: "shield",
    });
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.deepEqual(
      readdirSync(f.agentDir).filter((name) => name.includes(".tmp-")),
      [],
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("saving a mode preserves every valid custom root", () => {
  const f = fixture();
  try {
    const path = join(f.agentDir, "interlock.json");
    const original = {
      schemaVersion: 2,
      mode: "audit",
      credentialPaths: [join(f.root, "credential")],
      estateRoots: [join(f.root, "estate")],
      ephemeralRoots: [join(f.root, "ephemeral")],
    };
    writeFileSync(path, JSON.stringify(original));
    saveUserMode({ agentDir: f.agentDir, home: f.home }, "off");
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {
      ...original,
      mode: "off",
    });
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("saving a mode leaves invalid configuration untouched", () => {
  const f = fixture();
  try {
    const path = join(f.agentDir, "interlock.json");
    const original = '{"schemaVersion":2,"mode":"audit","unknown":true}';
    writeFileSync(path, original);
    assert.throws(() =>
      saveUserMode({ agentDir: f.agentDir, home: f.home }, "shield"),
    );
    assert.equal(readFileSync(path, "utf8"), original);
    assert.deepEqual(
      readdirSync(f.agentDir).filter((name) => name.includes(".tmp-")),
      [],
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("invalid and duplicate-key files discard the whole layer value-free", () => {
  for (const text of [
    '{"schemaVersion":2,"mode":"shield","unknown":true}',
    '{"schemaVersion":2,"mode":"shield","mode":"off"}',
    '{"schemaVersion":1,"mode":"shield"}',
    '{"schemaVersion":2,"mode":"shield","credentialPaths":["relative"]}',
    '{"schemaVersion":2,"mode":"shield","credentialPaths":["/tmp/*"]}',
  ]) {
    const f = fixture();
    try {
      writeFileSync(join(f.agentDir, "interlock.json"), text);
      const diagnostics: ConfigDiagnostic[] = [];
      const config = loadConfig({
        agentDir: f.agentDir,
        home: f.home,
        processMode: "off",
        diagnostic: (message) => diagnostics.push(message),
      });
      assert.equal(config.mode, "off");
      assert.deepEqual(diagnostics, ["interlock: invalid configuration"]);
      assert.equal(config.credentialRoots.length, 14);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test("project-local configuration is ignored", () => {
  const f = fixture();
  try {
    const project = join(f.root, "project", ".pi");
    mkdirSync(project, { recursive: true });
    writeFileSync(
      join(project, "interlock.json"),
      '{"schemaVersion":2,"mode":"shield"}',
    );
    assert.equal(
      loadConfig({ agentDir: f.agentDir, home: f.home }).mode,
      "audit",
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test("invalid process and scratchpad values emit value-free diagnostics", () => {
  const f = fixture();
  try {
    const diagnostics: ConfigDiagnostic[] = [];
    const config = loadConfig({
      agentDir: f.agentDir,
      home: f.home,
      processMode: "enforce",
      scratchpad: "relative/private",
      diagnostic: (message) => diagnostics.push(message),
    });
    assert.equal(config.mode, "audit");
    assert.deepEqual(diagnostics, [
      "interlock: invalid environment",
      "interlock: invalid environment",
    ]);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
