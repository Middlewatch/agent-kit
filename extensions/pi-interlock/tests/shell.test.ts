import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { GitCommandRunner } from "../src/contracts.ts";
import {
  detectShell as detectShellFull,
  MAX_PUSH_STATE_DIRECTORIES,
} from "../src/shell.ts";

const env = { cwd: "/repo", home: "/users/owner" };

function detectShell(command: string, callEnv = env) {
  const { paths, observations } = detectShellFull(command, callEnv);
  return { paths, observations };
}

test("quoted direct operands retain one path boundary", () => {
  const result = detectShell('cat "private auth.json"', env);
  assert.deepEqual(result.paths, [
    { path: "/repo/private auth.json", access: "read", source: "arg.0" },
  ]);
});

test("textual mentions and unsupported program forms establish no access", () => {
  assert.deepEqual(detectShell("echo /agent/auth.json", env), {
    paths: [],
    observations: [],
  });
  assert.deepEqual(detectShell("cat $(helper)", env), {
    paths: [],
    observations: ["unsupported:shell"],
  });
});

test("redirect access survives unsupported command operands", () => {
  assert.deepEqual(detectShell("wc -c < /agent/auth.json", env), {
    paths: [
      { path: "/agent/auth.json", access: "read", source: "redirect.in" },
    ],
    observations: ["unsupported:wc"],
  });
});

test("dev-null and descriptor redirects establish no path access", () => {
  for (const command of [
    "cat < /dev/null",
    "printf x > /dev/null",
    "printf x >> /dev/null",
    "cat <> /dev/null",
  ]) {
    assert.deepEqual(detectShell(command, env), {
      paths: [],
      observations: [],
    });
  }
  assert.deepEqual(detectShell("printf x 2>&1", env), {
    paths: [],
    observations: ["unsupported:shell"],
  });
});

test("independent top-level segments and literal cd retain direct access", () => {
  assert.deepEqual(
    detectShell("echo harmless; cd private && cat auth.json", env),
    {
      paths: [
        {
          path: "/repo/private/auth.json",
          access: "read",
          source: "arg.0",
        },
      ],
      observations: [],
    },
  );
});

test("opaque substitution does not leak inner text into an independent segment", () => {
  assert.deepEqual(
    detectShell("echo $(cat /agent/auth.json); echo done", env),
    {
      paths: [],
      observations: ["unsupported:shell"],
    },
  );
});

test("every frozen direct-path verb emits its exact access roles", () => {
  assert.deepEqual(detectShell("find private -type f", env).paths, [
    { path: "/repo/private", access: "read", source: "find.root" },
  ]);
  assert.deepEqual(detectShell("mkdir one two", env).paths, [
    { path: "/repo/one", access: "create", source: "arg.0" },
    { path: "/repo/two", access: "create", source: "arg.1" },
  ]);
  assert.deepEqual(detectShell("touch one", env).paths, [
    { path: "/repo/one", access: "create", source: "arg.0" },
  ]);
  assert.deepEqual(detectShell("chmod 0600 private", env).paths, [
    { path: "/repo/private", access: "edit", source: "arg.1" },
  ]);
  assert.deepEqual(detectShell("chown owner private", env).paths, [
    { path: "/repo/private", access: "edit", source: "arg.1" },
  ]);
});

test("unsupported direct-path forms never guess operands", () => {
  for (const command of [
    "find -unknown /agent/auth.json",
    "mkdir -p /agent/keys",
    "touch -c /agent/auth.json",
    "chmod -R 0600 /agent/keys",
    "chown --recursive owner /agent/keys",
  ]) {
    const result = detectShell(command, env);
    assert.deepEqual(result.paths, [], command);
    assert.equal(result.observations.length, 1, command);
  }
});

test("heredoc bodies are opaque while following top-level commands remain eligible", () => {
  assert.deepEqual(
    detectShell(
      "cat <<'EOF'\n/agent/auth.json\nEOF\necho done\ncat ordinary.txt",
      env,
    ),
    {
      paths: [{ path: "/repo/ordinary.txt", access: "read", source: "arg.0" }],
      observations: ["unsupported:shell"],
    },
  );
});

test("recursive deletion and catastrophe grammars retain exact shapes", () => {
  assert.deepEqual(detectShellFull("rm -fr -- build", env), {
    paths: [{ path: "/repo/build", access: "delete", source: "arg.0" }],
    recursiveDeletes: [
      { targets: ["/repo/build"], unresolvedTargets: [], source: "rm" },
    ],
    catastrophic: [],
    pushes: [],
    observations: [],
  });
  assert.deepEqual(detectShellFull('rm -rf "$TARGET"', env), {
    paths: [],
    recursiveDeletes: [
      { targets: [], unresolvedTargets: ["$TARGET"], source: "rm" },
    ],
    catastrophic: [],
    pushes: [],
    observations: ["unresolved-delete-target"],
  });
  assert.deepEqual(detectShellFull("rm -rf /*", env).catastrophic, [
    "catastrophic.root-recursive",
  ]);
  assert.deepEqual(
    detectShellFull("mkfs.ext4 /dev/example", env).catastrophic,
    ["catastrophic.filesystem-format"],
  );
  assert.deepEqual(
    detectShellFull("dd if=/dev/zero of=/dev/sda", env).catastrophic,
    ["catastrophic.raw-device"],
  );
  assert.deepEqual(detectShellFull(":(){ :|:& };:", env).catastrophic, [
    "catastrophic.fork-bomb",
  ]);
  assert.deepEqual(
    detectShellFull("find -type f -delete", env).recursiveDeletes,
    [{ targets: ["/repo"], unresolvedTargets: [], source: "find" }],
  );
  const unsupportedFind = detectShellFull("find -- build -delete", env);
  assert.deepEqual(unsupportedFind.recursiveDeletes, []);
  assert.deepEqual(unsupportedFind.observations, ["unsupported:find"]);
});

test("direct globs retain uncertainty and line continuations match Bash", () => {
  assert.deepEqual(detectShell("cat /users/owner/.ss?/id", env).paths, [
    {
      path: "/users/owner/.ss?/id",
      access: "read",
      source: "arg.0",
      unresolvedGlob: true,
    },
  ]);
  assert.deepEqual(detectShell("cat > /users/owner/.ss?/id", env).paths, [
    {
      path: "/users/owner/.ss?/id",
      access: "truncate",
      source: "redirect.out",
      unresolvedGlob: true,
    },
  ]);
  assert.deepEqual(detectShell("cat /users/owner/.s\\\nsh/id", env).paths, [
    { path: "/users/owner/.ssh/id", access: "read", source: "arg.0" },
  ]);
  assert.deepEqual(detectShell('cat "/users/owner/.s\\\nsh/id"', env).paths, [
    { path: "/users/owner/.ssh/id", access: "read", source: "arg.0" },
  ]);
});

test("expanded catastrophe and push forms remain unsupported default-allow shapes", () => {
  const expandedDevice = detectShellFull("dd of=/dev/$DEVICE", env);
  assert.deepEqual(expandedDevice.catastrophic, []);
  assert.deepEqual(expandedDevice.observations, ["unsupported:dd"]);

  const expandedPush = detectShellFull('git push origin "$SOURCE:main"', {
    ...env,
    gitRunner: gitFixtureRunner(),
  });
  assert.deepEqual(expandedPush.pushes, []);
  assert.deepEqual(expandedPush.observations, ["unsupported:git"]);
});

interface SeedFile {
  schemaVersion: number;
  seed: number;
  cases: number;
  families: string[];
}

function gitFixtureRunner(): GitCommandRunner {
  return (args) => {
    const command = args.slice(2).join(" ");
    if (command === "rev-parse --show-toplevel")
      return { ok: true, stdout: "/repo" };
    if (command === "symbolic-ref --quiet --short HEAD")
      return { ok: true, stdout: "feature" };
    if (command === "rev-parse --abbrev-ref --symbolic-full-name @{push}")
      return { ok: true, stdout: "origin/feature" };
    return { ok: false, stdout: "" };
  };
}

test("push state preflight is cached and bounded by distinct directory", () => {
  let probes = 0;
  const gitRunner: GitCommandRunner = (args) => {
    probes += 1;
    const command = args.slice(2).join(" ");
    if (command === "rev-parse --show-toplevel")
      return { ok: true, stdout: args[1]! };
    if (command === "symbolic-ref --quiet --short HEAD")
      return { ok: true, stdout: "feature" };
    if (command === "rev-parse --abbrev-ref --symbolic-full-name @{push}")
      return { ok: true, stdout: "origin/feature" };
    return { ok: false, stdout: "" };
  };

  const repeated = Array.from(
    { length: 20 },
    () => "git push origin feature",
  ).join("; ");
  const repeatedResult = detectShellFull(repeated, { ...env, gitRunner });
  assert.equal(repeatedResult.pushes.length, 20);
  assert.equal(probes, 3);

  probes = 0;
  const unique = Array.from(
    { length: MAX_PUSH_STATE_DIRECTORIES + 2 },
    (_, index) => `git -C /repo/target-${index} push origin feature`,
  ).join("; ");
  const uniqueResult = detectShellFull(unique, { ...env, gitRunner });
  assert.equal(uniqueResult.pushes.length, MAX_PUSH_STATE_DIRECTORIES + 2);
  assert.equal(probes, MAX_PUSH_STATE_DIRECTORIES * 3);
  assert.equal(
    uniqueResult.pushes.filter((push) => !push.stateResolved).length,
    2,
  );
  assert.deepEqual(uniqueResult.observations, [
    "git-state-unresolved",
    "git-state-unresolved",
  ]);
});

test("10,000 seeded detector combinations cover every frozen family", () => {
  const seed = JSON.parse(
    readFileSync(
      new URL("../fixtures/fuzz/detector-seeds.json", import.meta.url),
      "utf8",
    ),
  ) as SeedFile;
  assert.equal(seed.schemaVersion, 1);
  assert.equal(seed.cases, 10_000);
  let state = seed.seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
  const coverage = new Map(seed.families.map((family) => [family, 0]));
  const generatedEnv = { ...env, gitRunner: gitFixtureRunner() };
  for (let index = 0; index < seed.cases; index += 1) {
    const family = seed.families[index % seed.families.length]!;
    coverage.set(family, coverage.get(family)! + 1);
    const suffix = next() % 1_000;
    if (family === "rm-option-order") {
      const options = next() % 2 === 0 ? "-fr" : "--force --recursive";
      const result = detectShellFull(
        `rm ${options} -- build-${suffix}`,
        generatedEnv,
      );
      assert.deepEqual(result.recursiveDeletes[0], {
        targets: [`/repo/build-${suffix}`],
        unresolvedTargets: [],
        source: "rm",
      });
    } else if (family === "rm-quoted-literal") {
      const result = detectShellFull(
        `rm -rf "build item ${suffix}"`,
        generatedEnv,
      );
      assert.deepEqual(result.recursiveDeletes[0]?.targets, [
        `/repo/build item ${suffix}`,
      ]);
    } else if (family === "rm-unresolved-target") {
      const variable = `TARGET_${suffix}`;
      const result = detectShellFull(`rm -rf "$${variable}"`, generatedEnv);
      assert.deepEqual(result.recursiveDeletes[0]?.unresolvedTargets, [
        `$${variable}`,
      ]);
      assert.deepEqual(result.observations, ["unresolved-delete-target"]);
    } else if (family === "cwd-transition") {
      const result = detectShellFull(
        `cd sub && rm -rf build-${suffix}`,
        generatedEnv,
      );
      assert.deepEqual(result.recursiveDeletes[0]?.targets, [
        `/repo/sub/build-${suffix}`,
      ]);
    } else if (family === "push-protected-refspec") {
      const destination = next() % 2 === 0 ? "main" : "master";
      const result = detectShellFull(
        `git push origin feature:${destination}`,
        generatedEnv,
      );
      assert.deepEqual(result.pushes[0]?.destinations, [
        `refs/heads/${destination}`,
      ]);
    } else if (family === "push-force-option") {
      const option = next() % 2 === 0 ? "--force" : "--force-with-lease";
      const result = detectShellFull(
        `git push ${option} origin feature`,
        generatedEnv,
      );
      assert.equal(result.pushes[0]?.force, true);
    } else {
      const result = detectShellFull(
        `git push origin feature-${suffix}`,
        generatedEnv,
      );
      assert.deepEqual(result.pushes[0]?.destinations, [
        `refs/heads/feature-${suffix}`,
      ]);
      assert.equal(result.pushes[0]?.force, false);
    }
  }
  for (const [family, count] of coverage) assert(count > 0, family);
});
