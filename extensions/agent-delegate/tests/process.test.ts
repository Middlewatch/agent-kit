import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { type ManagedChild, stopProcessTree } from "../src/process.ts";

test("process cleanup escalates from ignored TERM to KILL and confirms close", async (t) => {
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)"], {
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  t.after(() => {
    if (!child.pid) return;
    try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL"); } catch { /* closed */ }
  });
  let resolveClosed!: (code: number) => void;
  const entry: ManagedChild = {
    child,
    exited: false,
    closed: new Promise((resolveCode) => { resolveClosed = resolveCode; }),
  };
  child.once("close", (code) => {
    entry.exited = true;
    resolveClosed(code ?? 1);
  });
  await new Promise((resolveReady) => setTimeout(resolveReady, 100));
  await stopProcessTree(entry, 100, 1000);
  assert.equal(entry.exited, true);
  assert.throws(() => process.kill(child.pid!, 0));
});

test("cleanup kills a same-group descendant after the leader exits on TERM", async (t) => {
  const script = [
    "const {spawn}=require('node:child_process');",
    "spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)\"],{stdio:'ignore'});",
    "process.on('SIGTERM',()=>process.exit(0));",
    "setInterval(()=>{},1000);",
  ].join("");
  const child = spawn(process.execPath, ["-e", script], {
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  t.after(() => {
    if (!child.pid) return;
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* tree closed */ }
  });
  let resolveClosed!: (code: number) => void;
  const entry: ManagedChild = {
    child,
    exited: false,
    closed: new Promise((resolveCode) => { resolveClosed = resolveCode; }),
  };
  child.once("close", (code) => {
    entry.exited = true;
    resolveClosed(code ?? 1);
  });
  await new Promise((resolveReady) => setTimeout(resolveReady, 150));
  await stopProcessTree(entry, 100, 1000);
  assert.throws(() => process.kill(-child.pid!, 0));
});

test("cleanup still kills descendants when requested after the leader already closed", async (t) => {
  const script = [
    "const {spawn}=require('node:child_process');",
    "spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{}); setInterval(()=>{},1000)\"],{stdio:'ignore'});",
    "setTimeout(()=>process.exit(0),100);",
  ].join("");
  const child = spawn(process.execPath, ["-e", script], {
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
  t.after(() => {
    if (!child.pid) return;
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* tree closed */ }
  });
  let resolveClosed!: (code: number) => void;
  const entry: ManagedChild = {
    child,
    exited: false,
    closed: new Promise((resolveCode) => { resolveClosed = resolveCode; }),
  };
  child.once("close", (code) => {
    entry.exited = true;
    resolveClosed(code ?? 1);
  });
  await entry.closed;
  assert.equal(entry.exited, true);
  await stopProcessTree(entry, 100, 1000);
  assert.throws(() => process.kill(-child.pid!, 0));
});
