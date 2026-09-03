#!/usr/bin/env python3
"""Pure-function tests for lemonade-hub-sync: scan, coverage, naming, staleness."""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import importlib.machinery
import importlib.util

_tool = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lemonade-hub-sync")
loader = importlib.machinery.SourceFileLoader("lhs", _tool)
spec = importlib.util.spec_from_loader("lhs", loader)
lhs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lhs)


def make_repo(hub, repo, files):
    snap = os.path.join(hub, "models--" + repo.replace("/", "--"), "snapshots", "abc123")
    os.makedirs(snap, exist_ok=True)
    for f, size in files:
        with open(os.path.join(snap, f), "wb") as fh:
            fh.write(b"\0" * size)


class ScanHubTest(unittest.TestCase):
    def test_groups_main_and_mmproj(self):
        with tempfile.TemporaryDirectory() as hub:
            make_repo(hub, "org/Foo-7B-GGUF", [("Foo-7B-Q4_K_M.gguf", 100), ("mmproj-F16.gguf", 10)])
            repos = lhs.scan_hub(hub)
            self.assertEqual([f for f, _ in repos["org/Foo-7B-GGUF"]["main"]], ["Foo-7B-Q4_K_M.gguf"])
            self.assertEqual([f for f, _ in repos["org/Foo-7B-GGUF"]["mmproj"]], ["mmproj-F16.gguf"])

    def test_ignores_non_gguf_and_non_model_dirs(self):
        with tempfile.TemporaryDirectory() as hub:
            make_repo(hub, "org/Bar", [("weights.safetensors", 100), ("README.md", 5)])
            os.makedirs(os.path.join(hub, "datasets--org--data", "snapshots", "x"))
            open(os.path.join(hub, "datasets--org--data", "snapshots", "x", "d.gguf"), "w").close()
            self.assertEqual(lhs.scan_hub(hub), {})


class PlanAdditionsTest(unittest.TestCase):
    def test_skips_covered_and_names_new(self):
        repos = {
            "org/Foo-7B-GGUF": {"main": [("Foo-7B-Q4_K_M.gguf", 100), ("Foo-7B-Q8_0.gguf", 200)],
                                "mmproj": [("mmproj-F16.gguf", 10)]},
        }
        covered = {"org/Foo-7B-GGUF:Foo-7B-Q4_K_M.gguf"}
        plan, _ = lhs.plan_additions(repos, covered, set())
        self.assertEqual(len(plan), 1)
        add = plan[0]
        self.assertEqual(add["model_name"], "user.Foo-7B-Q8_0")
        self.assertEqual(add["checkpoints"]["mmproj"], "org/Foo-7B-GGUF:mmproj-F16.gguf")
        self.assertIn("vision", add["labels"])
        self.assertIn("autosync", add["labels"])

    def test_whole_repo_ref_covers_all_files(self):
        repos = {"org/Baz": {"main": [("a.gguf", 1)], "mmproj": []}}
        plan, _ = lhs.plan_additions(repos, {"org/Baz"}, set())
        self.assertEqual(plan, [])

    def test_variant_tag_covers_matching_file_only(self):
        repos = {"org/Q-9B-GGUF": {"main": [("Q-9B-UD-Q4_K_XL.gguf", 1), ("Q-9B-UD-Q8_0.gguf", 2)],
                                   "mmproj": []}}
        plan, _ = lhs.plan_additions(repos, {"org/Q-9B-GGUF:UD-Q4_K_XL"}, set())
        self.assertEqual([p["model_name"] for p in plan], ["user.Q-9B-UD-Q8_0"])

    def test_variant_tag_ref_survives_staleness_check(self):
        with tempfile.TemporaryDirectory() as hub:
            make_repo(hub, "org/Q-9B-GGUF", [("Q-9B-UD-Q4_K_XL.gguf", 1)])
            user_models = {"user.Q9": {"checkpoint": "org/Q-9B-GGUF:UD-Q4_K_XL"}}
            self.assertEqual(lhs.plan_removals(user_models, hub), [])

    def test_same_size_duplicate_skipped(self):
        repos = {
            "a/Base-GGUF": {"main": [("m.gguf", 100)], "mmproj": []},
            "b/MTP-GGUF": {"main": [("m.gguf", 100)], "mmproj": []},
        }
        plan, skips = lhs.plan_additions(repos, {"a/Base-GGUF:m.gguf"}, set())
        self.assertEqual(plan, [])
        self.assertEqual(skips, [("b/MTP-GGUF", "m.gguf", "a/Base-GGUF")])

    def test_same_filename_other_repo_qualifies_name(self):
        repos = {"b/Qwen-35B-MTP-GGUF": {"main": [("Qwen-35B-UD-Q8_K_XL.gguf", 200)], "mmproj": []}}
        plan, skips = lhs.plan_additions(repos, {"a/Qwen-35B-GGUF:Qwen-35B-UD-Q8_K_XL.gguf"}, set())
        self.assertEqual([p["model_name"] for p in plan], ["user.Qwen-35B-UD-Q8_K_XL-MTP"])
        self.assertEqual(skips, [])

    def test_collision_gets_qualified(self):
        repos = {
            "a/Model": {"main": [("m.gguf", 1)], "mmproj": []},
            "b/Model": {"main": [("m.gguf", 2)], "mmproj": []},
        }
        names = [p["model_name"] for p in lhs.plan_additions(repos, set(), set())[0]]
        self.assertEqual(len(set(names)), 2)


class ExtraModelsRefreshTest(unittest.TestCase):
    def test_root_marker_is_created_and_removed(self):
        with tempfile.TemporaryDirectory() as extra:
            with mock.patch.object(lhs, "fetch_json", return_value={"extra_models_dir": extra}), \
                 mock.patch.object(lhs.time, "sleep"):
                self.assertTrue(lhs.signal_extra_models_rescan("http://server"))
            self.assertEqual(os.listdir(extra), [])


class PlanRemovalsTest(unittest.TestCase):
    def test_stale_when_all_refs_gone(self):
        with tempfile.TemporaryDirectory() as hub:
            make_repo(hub, "org/Alive", [("alive.gguf", 1)])
            user_models = {
                "user.Dead": {"checkpoints": {"main": "org/Gone:dead.gguf"}},
                "user.Alive": {"checkpoints": {"main": "org/Alive:alive.gguf"}},
                "user.NoRefs": {"recipe": "llamacpp"},
                "user.SingleShape": {"checkpoint": "org/Gone:dead.gguf"},
            }
            stale = lhs.plan_removals(user_models, hub)
            self.assertEqual(sorted(stale), ["user.Dead", "user.SingleShape"])


if __name__ == "__main__":
    unittest.main()
