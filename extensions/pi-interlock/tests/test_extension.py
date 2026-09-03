import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = [
    ROOT / "fixtures" / "seatbelt-v2" / "credentials.jsonl",
    ROOT / "fixtures" / "seatbelt-v2" / "deletions.jsonl",
    ROOT / "fixtures" / "seatbelt-v2" / "catastrophes.jsonl",
    ROOT / "fixtures" / "seatbelt-v2" / "pushes.jsonl",
    ROOT / "fixtures" / "seatbelt-v2" / "audit.jsonl",
]
FIXED_AUDIT_TIMESTAMP = "2026-08-14T00:00:00.000Z"
DRIVER = ROOT / "tests" / "pi-driver.ts"
ENTRY = ROOT / "index.ts"
REASONS = {
    "credential.direct-access": "Direct credential-store access is blocked.",
    "credential.audit-access": "Direct Interlock audit access is blocked.",
    "path.resolution-failed": "Path resolution failed; the operation is blocked.",
    "catastrophic.root-recursive": "Recursive filesystem-root deletion is blocked.",
    "catastrophic.raw-device": "Direct raw-device overwrite is blocked.",
    "catastrophic.filesystem-format": "Direct filesystem formatting is blocked.",
    "catastrophic.fork-bomb": "Direct process fork bomb is blocked.",
    "delete.boundary": "Confirm recursive deletion across a protected boundary.",
    "push.protected-branch": "Confirm push to a protected branch.",
    "push.force-or-bulk": "Confirm force or bulk push.",
}


def substitute(value, replacements):
    if isinstance(value, str):
        for placeholder, replacement in replacements.items():
            value = value.replace(placeholder, replacement)
        return value
    if isinstance(value, list):
        return [substitute(item, replacements) for item in value]
    if isinstance(value, dict):
        return {key: substitute(item, replacements) for key, item in value.items()}
    return value


def run_git(cwd, *args):
    return subprocess.run(
        ["git", "-C", str(cwd), *args],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def setup_git(value):
    repo = Path(value["repo"])
    repo.mkdir(parents=True, exist_ok=True)
    branch = value["branch"]
    run_git(repo, "init", "-b", branch)
    run_git(repo, "config", "user.name", "Interlock Fixture")
    run_git(repo, "config", "user.email", "interlock@example.invalid")
    (repo / ".fixture").write_text("fixture\n")
    run_git(repo, "add", ".fixture")
    run_git(repo, "commit", "-m", "fixture")
    remote_value = value.get("remote")
    if remote_value is None:
        return
    remote = Path(remote_value)
    remote.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "init", "--bare", str(remote)],
        check=True,
        capture_output=True,
        text=True,
    )
    run_git(repo, "remote", "add", "origin", str(remote))
    run_git(repo, "push", "-u", "origin", branch)
    destination = value.get("pushDestination")
    if destination is not None:
        remote_name, destination_branch = destination.split("/", 1)
        run_git(repo, "push", remote_name, f"HEAD:refs/heads/{destination_branch}")
        run_git(repo, "config", f"branch.{branch}.remote", remote_name)
        run_git(
            repo,
            "config",
            f"branch.{branch}.merge",
            f"refs/heads/{destination_branch}",
        )
        run_git(repo, "config", "push.default", "upstream")


def replacements(root):
    return {
        "$ROOT": str(root),
        "$HOME": str(root / "home"),
        "$PI_CONFIG": str(root / "pi-agent"),
        "$AUDIT": str(root / "pi-agent" / "var" / "interlock"),
        "$REPO": str(root / "repo"),
        "$OTHER_REPO": str(root / "other-repo"),
        "$OUTSIDE": str(root / "outside"),
        "$TMP": str(root / "tmp"),
        "$CUSTOM": str(root / "custom-credential"),
        "$BARE_REMOTE": str(root / "remote.git"),
        "$DEVICE": "/dev/interlock-fixture-device",
    }


def prepare(row, root, values):
    setup = substitute(row["setup"], values)
    for directory in setup.get("dirs", []):
        Path(directory).mkdir(parents=True, exist_ok=True)
    for file in setup.get("files", []):
        target = Path(file)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("fixture")
    for link, target in setup.get("symlinks", []):
        Path(link).symlink_to(target)
    repositories = setup.get("git", [])
    if isinstance(repositories, dict):
        repositories = [repositories]
    for repository in repositories:
        setup_git(repository)
    agent = Path(values["$PI_CONFIG"])
    agent.mkdir(parents=True, exist_ok=True)
    if "config" in setup:
        config = {
            "schemaVersion": 2,
            "mode": "audit",
            "credentialPaths": setup["config"].get("credentialPaths", []),
            "estateRoots": setup["config"].get("estateRoots", []),
            "ephemeralRoots": setup["config"].get("ephemeralRoots", []),
        }
        (agent / "interlock.json").write_text(json.dumps(config))
    return agent, setup


def audit_observation(agent):
    directory = agent / "var" / "interlock"
    files = sorted(directory.glob("decisions-*.ndjson")) if directory.exists() else []
    records = [
        json.loads(line)
        for file in files
        for line in file.read_text().splitlines()
    ]
    return {
        "files": [file.name for file in files],
        "records": records,
        "directoryMode": f"{directory.stat().st_mode & 0o777:04o}" if files else None,
        "fileModes": [f"{file.stat().st_mode & 0o777:04o}" for file in files],
    }


def string_values(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from string_values(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from string_values(item)


def fixture_row(fixture_id):
    for fixture in FIXTURES:
        for line in fixture.read_text().splitlines():
            row = json.loads(line)
            if row["id"] == fixture_id:
                return row
    raise AssertionError(f"missing fixture {fixture_id}")


def verify_audit_digest(testcase, record):
    without_digest = {
        key: value for key, value in record.items() if key != "digest"
    }
    canonical = json.dumps(
        without_digest,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    testcase.assertEqual(
        record["digest"],
        f"sha256:{hashlib.sha256(canonical).hexdigest()}",
    )


class TestSeatbeltExtension(unittest.TestCase):
    def invoke(self, row, ui_response, throw_status=False, command=None):
        with tempfile.TemporaryDirectory(dir=Path.home()) as temp:
            root = Path(temp)
            values = replacements(root)
            agent, setup = prepare(row, root, values)
            input_row = substitute(row["input"], values)
            expected = substitute(row["expect"], values)
            effect = root / "effects" / f"{row['id']}.count"
            request = {
                "agentDir": str(agent),
                "cwd": input_row["cwd"],
                "effectPath": str(effect),
                "entry": str(ENTRY),
                "toolName": input_row["tool"],
                "input": input_row["arguments"],
                "uiResponse": ui_response,
                "throwStatus": throw_status,
            }
            if command is not None:
                request["command"] = command
            env = {
                **os.environ,
                "HOME": values["$HOME"],
                "PI_CODING_AGENT_DIR": str(agent),
                "PI_INTERLOCK_MODE": input_row["mode"],
                "PI_INTERLOCK_TEST": "1",
            }
            for key, value in setup.get("env", {}).items():
                env[key] = str(value)
            if row["id"].startswith("audit."):
                env["PI_INTERLOCK_TEST_AUDIT_TIMESTAMP"] = FIXED_AUDIT_TIMESTAMP
            if ui_response == "timeout":
                env["PI_INTERLOCK_TEST_CONFIRM_TIMEOUT_MS"] = "20"
            completed = subprocess.run(
                ["node", "--experimental-strip-types", str(DRIVER)],
                cwd=ROOT,
                env=env,
                input=json.dumps(request),
                capture_output=True,
                text=True,
                timeout=12,
                check=False,
            )
            self.assertEqual(
                completed.returncode,
                0,
                msg=f"{row['id']} {ui_response}\nstdout={completed.stdout}\nstderr={completed.stderr}",
            )
            observed = json.loads(completed.stdout)
            effect_text = effect.read_text() if effect.exists() else None
            return (
                observed,
                effect_text,
                audit_observation(agent),
                completed.stderr,
                expected,
                input_row,
            )

    def test_compound_root_deletion_cannot_be_downgraded_to_confirmation(self):
        row = {
            "id": "remediation.delete-precedence",
            "setup": {"dirs": ["$REPO/sub"]},
            "input": {
                "mode": "shield",
                "tool": "bash",
                "cwd": "$REPO/sub",
                "arguments": {"command": "rm -rf ..; find / -delete"},
            },
            "expect": {},
        }
        observed, effect, _, stderr, _, _ = self.invoke(row, "yes")
        self.assertTrue(observed["block"])
        self.assertIsNone(effect)
        self.assertEqual(observed["confirmations"], [])
        self.assertEqual(stderr, "")

    def test_credential_glob_and_line_continuation_are_denied(self):
        commands = [
            "cat $HOME/.ss?/id",
            "cat $HOME/.s" + "\\\n" + "sh/id",
        ]
        for index, command in enumerate(commands):
            row = {
                "id": f"remediation.credential-{index}",
                "setup": {
                    "dirs": ["$REPO", "$HOME/.ssh"],
                    "files": ["$HOME/.ssh/id"],
                },
                "input": {
                    "mode": "shield",
                    "tool": "bash",
                    "cwd": "$REPO",
                    "arguments": {"command": command},
                },
                "expect": {},
            }
            with self.subTest(command=repr(command)):
                observed, effect, _, stderr, _, _ = self.invoke(row, "yes")
                self.assertTrue(observed["block"])
                self.assertIsNone(effect)
                self.assertEqual(observed["confirmations"], [])
                self.assertEqual(stderr, "")

    def test_repository_probe_budget_becomes_an_unresolved_delete_hold(self):
        targets = [f"$REPO/target-{index}" for index in range(10)]
        row = {
            "id": "remediation.probe-budget",
            "setup": {"dirs": ["$REPO", *targets]},
            "input": {
                "mode": "shield",
                "tool": "bash",
                "cwd": "$REPO",
                "arguments": {"command": f"rm -rf {' '.join(targets)}"},
            },
            "expect": {},
        }
        observed, effect, _, stderr, _, _ = self.invoke(row, "no")
        self.assertTrue(observed["block"])
        self.assertIsNone(effect)
        self.assertEqual(len(observed["confirmations"]), 1)
        self.assertEqual(stderr, "")

    def test_slash_command_changes_the_live_mode_and_persists_it(self):
        row = fixture_row("catastrophic.001")
        observed, effect, audit, stderr, _, _ = self.invoke(
            row, "yes", command="/interlock off"
        )
        self.assertFalse(observed["block"])
        self.assertEqual(effect, "executed\n")
        self.assertEqual(audit["records"], [])
        self.assertEqual(stderr, "")
        self.assertEqual(observed["persistedMode"], "off")
        self.assertIn(
            {"key": "interlock", "text": "Interlock: shield"},
            observed["statuses"],
        )
        self.assertIn(
            {"key": "interlock", "text": "Interlock: off"},
            observed["statuses"],
        )
        self.assertEqual(observed["notifications"][-1]["level"], "info")
        self.assertIn(
            "Interlock active mode: off", observed["notifications"][-1]["message"]
        )
        self.assertIn(
            "PI_INTERLOCK_MODE=shield",
            observed["notifications"][-1]["message"],
        )

    def test_slash_command_can_raise_the_live_mode(self):
        row = fixture_row("credential.020")
        observed, effect, _, stderr, _, _ = self.invoke(
            row, "yes", command="/interlock shield"
        )
        self.assertTrue(observed["block"])
        self.assertIsNone(effect)
        self.assertEqual(stderr, "")
        self.assertEqual(observed["persistedMode"], "shield")
        self.assertIn(
            {"key": "interlock", "text": "Interlock: shield"},
            observed["statuses"],
        )

    def test_slash_command_rejects_an_unknown_mode_without_changing_it(self):
        row = fixture_row("catastrophic.001")
        observed, effect, _, stderr, _, _ = self.invoke(
            row, "yes", command="/interlock permissive"
        )
        self.assertTrue(observed["block"])
        self.assertIsNone(effect)
        self.assertEqual(stderr, "")
        self.assertNotIn("persistedMode", observed)
        self.assertEqual(
            observed["notifications"][-1],
            {"message": "Usage: /interlock off|audit|shield", "level": "error"},
        )

    def test_slash_command_without_argument_reports_the_active_mode(self):
        row = fixture_row("credential.020")
        observed, _, _, stderr, _, _ = self.invoke(
            row, "yes", command="/interlock"
        )
        self.assertEqual(stderr, "")
        self.assertEqual(observed["notifications"][-1]["level"], "info")
        self.assertIn(
            "Interlock active mode: audit",
            observed["notifications"][-1]["message"],
        )

    def test_credential_audit_redacts_the_canonical_path(self):
        observed, effect, audit, stderr, _, _ = self.invoke(
            fixture_row("audit.001"), "yes"
        )
        self.assertFalse(observed["block"])
        self.assertEqual(effect, "executed\n")
        self.assertEqual(stderr, "")
        self.assertEqual(audit["records"][0]["shape"]["paths"][0]["token"], "@credential")

    def test_unsupported_executable_basename_is_not_audit_data(self):
        row = fixture_row("audit.006")
        row["input"]["arguments"]["command"] = "mkfs.secret-token $TARGET"
        observed, effect, audit, stderr, _, _ = self.invoke(row, "yes")
        self.assertFalse(observed["block"])
        self.assertEqual(effect, "executed\n")
        self.assertEqual(stderr, "")
        self.assertEqual(
            audit["records"][0]["shape"]["observations"], ["unsupported:tool"]
        )
        for value in string_values(audit["records"][0]):
            self.assertNotIn("secret-token", value)

    def test_audit_failure_preserves_the_public_execution(self):
        observed, effect, audit, stderr, expected, _ = self.invoke(
            fixture_row("audit.008"), "yes"
        )
        self.assertFalse(observed["block"])
        self.assertEqual(effect, "executed\n")
        self.assertEqual(audit["records"], [])
        self.assertEqual(stderr, f"{expected['audit']['diagnostic']}\n")

    def test_throwing_status_sink_preserves_allow_ask_and_deny(self):
        cases = [
            ("audit.008", False, "executed\n"),
            ("delete.001", False, "executed\n"),
            ("audit.009", True, None),
        ]
        for fixture_id, blocked, effect_expected in cases:
            row = fixture_row(fixture_id)
            row["setup"].setdefault("env", {})["AUDIT_FAILURE"] = "1"
            with self.subTest(fixture_id=fixture_id):
                observed, effect, audit, stderr, expected, _ = self.invoke(
                    row, "yes", throw_status=True
                )
                self.assertEqual(observed["block"], blocked)
                self.assertEqual(effect, effect_expected)
                self.assertEqual(audit["records"], [])
                self.assertEqual(stderr, "interlock: audit write failed\n")
                self.assertEqual(
                    observed["statuses"],
                    [
                        {
                            "key": "interlock",
                            "text": f"Interlock: {row['input']['mode']}",
                        },
                        {
                            "key": "interlock-audit",
                            "text": "Interlock: audit degraded",
                        },
                    ],
                )
                public_verdict, rule_id = expected["public"]
                if public_verdict == "ask":
                    self.assertEqual(
                        observed["confirmations"],
                        [
                            {
                                "title": "Interlock confirmation",
                                "message": REASONS[rule_id],
                            }
                        ],
                    )
                if blocked:
                    self.assertEqual(
                        observed["reason"], f"[{rule_id}] {REASONS[rule_id]}"
                    )

    def test_all_73_active_rows_and_complete_ask_matrix_through_real_pi(self):
        rows = [
            json.loads(line)
            for fixture in FIXTURES
            for line in fixture.read_text().splitlines()
        ]
        self.assertEqual(len(rows), 73)
        for row in rows:
            frozen_expected = row["expect"]
            cases = (
                ["yes", "no", "timeout", "noUi"]
                if isinstance(frozen_expected["effect"], dict)
                else (["yes"] if "audit" in frozen_expected else ["noUi"])
            )
            for ui_response in cases:
                with self.subTest(fixture_id=row["id"], ui=ui_response):
                    (
                        observed,
                        effect_text,
                        audit,
                        stderr,
                        expected,
                        input_row,
                    ) = self.invoke(row, ui_response)
                    public_verdict, rule_id = expected["public"]
                    expected_execution = (
                        expected["effect"][ui_response]
                        if isinstance(expected["effect"], dict)
                        else expected["effect"]
                    )
                    self.assertEqual(observed["block"], expected_execution == "absent")
                    self.assertEqual(observed["toolStarts"], 1)
                    self.assertEqual(observed["toolEnds"], 1)
                    if observed["block"]:
                        self.assertEqual(
                            observed["reason"], f"[{rule_id}] {REASONS[rule_id]}"
                        )
                    self.assertEqual(
                        effect_text,
                        "executed\n" if expected_execution == "once" else None,
                    )
                    confirmations = observed["confirmations"]
                    if public_verdict == "ask" and ui_response != "noUi":
                        self.assertEqual(
                            confirmations,
                            [
                                {
                                    "title": "Interlock confirmation",
                                    "message": REASONS[rule_id],
                                }
                            ],
                        )
                    else:
                        self.assertEqual(confirmations, [])

                    expected_audit = expected.get("audit")
                    write_failed = (
                        expected_audit is not None
                        and expected_audit.get("write") == "failed"
                    )
                    expected_statuses = (
                        []
                        if ui_response == "noUi"
                        else [
                            {
                                "key": "interlock",
                                "text": f"Interlock: {input_row['mode']}",
                            }
                        ]
                    )
                    if write_failed:
                        self.assertEqual(
                            stderr,
                            f"{expected_audit['diagnostic']}\n",
                        )
                        expected_statuses.append(
                            {
                                "key": "interlock-audit",
                                "text": "Interlock: audit degraded",
                            }
                        )
                    else:
                        self.assertEqual(stderr, "")
                    self.assertEqual(observed["statuses"], expected_statuses)

                    if input_row["mode"] == "off" or write_failed:
                        self.assertEqual(audit["records"], [])
                        if write_failed:
                            serialized_output = stderr + json.dumps(
                                observed, ensure_ascii=False
                            )
                            for forbidden in expected_audit["forbid"]:
                                self.assertNotIn(
                                    forbidden,
                                    serialized_output,
                                    msg=f"{row['id']} leaked {forbidden}",
                                )
                        continue

                    self.assertEqual(len(audit["records"]), 1)
                    record = audit["records"][0]
                    self.assertEqual(
                        set(record),
                        {
                            "schemaVersion",
                            "timestamp",
                            "mode",
                            "tool",
                            "shape",
                            "publicVerdict",
                            "publicRuleId",
                            "shadowVerdict",
                            "shadowRuleId",
                            "enforcement",
                            "digest",
                        },
                    )
                    self.assertEqual(record["schemaVersion"], 2)
                    self.assertEqual(record["mode"], input_row["mode"])
                    self.assertEqual(record["tool"], input_row["tool"])
                    self.assertEqual(record["publicVerdict"], public_verdict)
                    self.assertEqual(record["publicRuleId"], rule_id)
                    if input_row["mode"] == "audit":
                        shadow_verdict, shadow_rule = expected["shadow"]
                        self.assertEqual(record["shadowVerdict"], shadow_verdict)
                        self.assertEqual(record["shadowRuleId"], shadow_rule)
                        self.assertEqual(record["enforcement"], "shadow")
                    else:
                        self.assertIsNone(record["shadowVerdict"])
                        self.assertIsNone(record["shadowRuleId"])
                        self.assertEqual(record["enforcement"], "enforced")
                    self.assertEqual(
                        set(record["shape"]),
                        {
                            "cwd",
                            "authority",
                            "paths",
                            "recursiveDeletes",
                            "catastrophic",
                            "pushes",
                            "observations",
                        },
                    )
                    verify_audit_digest(self, record)
                    self.assertEqual(audit["directoryMode"], "0700")
                    self.assertEqual(audit["fileModes"], ["0600"])

                    if row["id"].startswith("audit."):
                        self.assertEqual(record["timestamp"], FIXED_AUDIT_TIMESTAMP)
                        self.assertEqual(
                            audit["files"], ["decisions-2026-08-14.ndjson"]
                        )
                    if expected_audit is None:
                        continue
                    self.assertEqual(
                        record["enforcement"], expected_audit["enforcement"]
                    )
                    tokens = [
                        record["shape"]["cwd"],
                        record["shape"]["authority"],
                        *[item["token"] for item in record["shape"]["paths"]],
                        *[
                            token
                            for deletion in record["shape"]["recursiveDeletes"]
                            for token in deletion["literalTokens"]
                        ],
                    ]
                    for token in expected_audit["pathTokens"]:
                        self.assertIn(token, tokens)
                    record_values = list(string_values(record))
                    for forbidden in expected_audit["forbid"]:
                        for value in record_values:
                            self.assertNotIn(
                                forbidden,
                                value,
                                msg=f"{row['id']} leaked {forbidden}",
                            )
                    if expected_audit.get("protectedDestination"):
                        self.assertTrue(
                            any(
                                push["explicitProtectedDestination"]
                                or push["resolvedProtectedDestination"]
                                or push["currentBranchProtected"]
                                for push in record["shape"]["pushes"]
                            )
                        )


if __name__ == "__main__":
    unittest.main()
