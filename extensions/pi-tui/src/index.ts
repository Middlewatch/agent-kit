/**
 * pi-tui: the owner's TUI layer for pi. Each module registers one concern;
 * this file wires them. Spec: docs/specs/2026-08-30-pi-tui.md in the kit.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerChrome } from "./chrome.ts";
import { registerEditCommand } from "./edit-command.ts";
import { registerProbes } from "./probes.ts";
import { registerTodoWidget } from "./todo-widget.ts";
import { registerGutterTools } from "./tools.ts";

export default function (pi: ExtensionAPI) {
	registerProbes(pi);
	registerGutterTools(pi);
	registerChrome(pi);
	registerTodoWidget(pi);
	registerEditCommand(pi);
}
