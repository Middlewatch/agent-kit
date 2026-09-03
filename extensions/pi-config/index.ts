/**
 * /config — pi's `pi config` picker inside the session. Toggles extensions,
 * skills, prompts, and themes in global settings or as project overrides,
 * writes the same settings.json shapes the CLI writes, and reloads when
 * anything changed. The pure model lives in lib.ts; this file resolves pi's
 * resources, adapts the SettingsManager, and renders.
 */

import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, DefaultPackageManager, DynamicBorder, getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import { decodeKittyPrintable, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { ConfigModel, type FlatEntry, type PackageSource, type ResourceType, type SettingsPort, type WriteScope } from "./lib.ts";

const CHROME_LINES = 8;

/** Plain typed or pasted text: no control characters, not an escape sequence. */
function asTextInput(data: string): string | undefined {
	const pasted = data.startsWith("\x1b[200~") && data.endsWith("\x1b[201~") ? data.slice(6, -6) : data;
	if (pasted.length === 0) return undefined;
	for (const ch of pasted) {
		const cp = ch.codePointAt(0) ?? 0;
		if (cp < 0x20 || cp === 0x7f) return undefined;
	}
	return pasted;
}

function settingsPort(sm: SettingsManager): SettingsPort {
	const setters: Record<WriteScope, Record<ResourceType, (paths: string[]) => void>> = {
		global: {
			extensions: (p) => sm.setExtensionPaths(p),
			skills: (p) => sm.setSkillPaths(p),
			prompts: (p) => sm.setPromptTemplatePaths(p),
			themes: (p) => sm.setThemePaths(p),
		},
		project: {
			extensions: (p) => sm.setProjectExtensionPaths(p),
			skills: (p) => sm.setProjectSkillPaths(p),
			prompts: (p) => sm.setProjectPromptTemplatePaths(p),
			themes: (p) => sm.setProjectThemePaths(p),
		},
	};
	return {
		getGlobalSettings: () => sm.getGlobalSettings(),
		getProjectSettings: () => sm.getProjectSettings(),
		setPaths: (scope, type, paths) => setters[scope][type](paths),
		setPackages: (scope, packages: PackageSource[]) =>
			scope === "project" ? sm.setProjectPackages(packages) : sm.setPackages(packages),
	};
}

function renderEntry(model: ConfigModel, entry: FlatEntry, selected: boolean, theme: Theme, width: number): string {
	if (entry.type === "group") return truncateToWidth(theme.bold(theme.fg("accent", entry.group.label)), width);
	if (entry.type === "subgroup") return truncateToWidth(`  ${theme.fg("muted", entry.subgroup.label)}`, width);
	const item = entry.item;
	const v = model.view(item);
	let box: string;
	if (model.writeScope === "project") {
		if (v.override === "load") box = theme.fg("success", "[+]");
		else if (v.override === "unload") box = theme.fg("warning", "[-]");
		else box = theme.fg("dim", v.enabled ? "[x]" : "[ ]");
	} else {
		box = v.enabled ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
	}
	let suffix = "";
	if (model.writeScope === "project") {
		if (v.override === "load") suffix = theme.fg("muted", "  project load");
		else if (v.override === "unload") suffix = theme.fg("muted", "  project unload");
		else if (v.inheritedGlobal) suffix = theme.fg("dim", "  inherited global");
	} else if (!v.togglable) {
		suffix = theme.fg("dim", "  project (Tab to edit)");
	}
	const name = v.dimmed || !v.togglable ? theme.fg("dim", item.displayName) : selected ? theme.fg("accent", item.displayName) : item.displayName;
	const prefix = selected ? theme.fg("accent", "› ") : "  ";
	return truncateToWidth(`  ${prefix}${box} ${name}${suffix}`, width);
}

async function openPicker(ctx: ExtensionCommandContext, model: ConfigModel, projectModeAvailable: boolean): Promise<void> {
	await ctx.ui.custom<void>((tui, theme, kb, done) => {
		let scrollTop = 0;
		const maxVisible = () => Math.max(5, (tui.terminal.rows ?? 24) - CHROME_LINES);

		const header = {
			render: (w: number) => {
				const scope = model.writeScope === "global" ? "global settings" : "project overrides";
				const title = theme.bold(theme.fg("accent", "Config")) + theme.fg("muted", `  ${scope}`);
				const hint = projectModeAvailable ? theme.fg("dim", "  tab switch scope") : theme.fg("dim", "  project overrides need /trust");
				const filter = model.filter ? theme.fg("dim", `  filter: ${model.filter}`) : theme.fg("dim", "  type to filter");
				return [truncateToWidth(title + hint + filter, w)];
			},
			invalidate: () => {},
		};

		const list = {
			render: (w: number) => {
				const entries = model.entries;
				if (entries.length === 0) return [theme.fg("warning", "  no resources match")];
				const visible = maxVisible();
				if (model.selectedIndex < scrollTop) scrollTop = model.selectedIndex;
				if (model.selectedIndex >= scrollTop + visible) scrollTop = model.selectedIndex - visible + 1;
				scrollTop = Math.max(0, Math.min(scrollTop, Math.max(0, entries.length - visible)));
				const lines = entries
					.slice(scrollTop, scrollTop + visible)
					.map((e, i) => renderEntry(model, e, scrollTop + i === model.selectedIndex, theme, w));
				if (entries.length > visible) lines.push(theme.fg("dim", `  ${scrollTop + 1}-${Math.min(scrollTop + visible, entries.length)} of ${entries.length}`));
				return lines;
			},
			invalidate: () => {},
		};

		const footer = {
			render: (w: number) => [
				truncateToWidth(theme.fg("dim", "↑↓ move • space toggle • esc close" + (projectModeAvailable ? " • tab scope" : "")), w),
			],
			invalidate: () => {},
		};

		const border = () => new DynamicBorder((s: string) => theme.fg("accent", s));
		const parts = [border(), header, list, footer, border()];

		return {
			render: (w: number) => parts.flatMap((p) => p.render(w)),
			invalidate: () => {},
			handleInput: (data: string) => {
				if (kb.matches(data, "tui.select.up")) model.move(-1);
				else if (kb.matches(data, "tui.select.down")) model.move(1);
				else if (kb.matches(data, "tui.select.pageUp")) model.page(-1, maxVisible());
				else if (kb.matches(data, "tui.select.pageDown")) model.page(1, maxVisible());
				else if (kb.matches(data, "tui.select.cancel") || matchesKey(data, "ctrl+c")) return done();
				else if (kb.matches(data, "tui.input.tab")) {
					if (projectModeAvailable) model.setWriteScope(model.writeScope === "global" ? "project" : "global");
				} else if (data === " " || kb.matches(data, "tui.select.confirm")) model.toggleSelected();
				else if (matchesKey(data, "backspace")) model.setFilter([...model.filter].slice(0, -1).join(""));
				else {
					const text = decodeKittyPrintable(data) ?? asTextInput(data);
					if (text !== undefined) model.setFilter(model.filter + text);
				}
				tui.requestRender();
			},
		};
	});
}

export default function piConfig(pi: ExtensionAPI) {
	pi.registerCommand("config", {
		description: "Enable or disable extensions, skills, prompts, and themes (global or project scope); reloads on change",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/config needs the TUI; run `pi config` from a shell instead", "warning");
				return;
			}
			const cwd = ctx.cwd;
			const agentDir = getAgentDir();
			const trusted = ctx.isProjectTrusted();

			// Fresh managers read settings.json as it is on disk; ctx.reload() re-reads it after we write.
			const globalSm = SettingsManager.create(cwd, agentDir, { projectTrusted: false });
			const global = await new DefaultPackageManager({ cwd, agentDir, settingsManager: globalSm }).resolve();
			const writeSm = trusted ? SettingsManager.create(cwd, agentDir, { projectTrusted: true }) : globalSm;
			const project = trusted ? await new DefaultPackageManager({ cwd, agentDir, settingsManager: writeSm }).resolve() : global;

			const model = new ConfigModel({ global, project }, settingsPort(writeSm), { cwd, agentDir, configDirName: CONFIG_DIR_NAME });
			await openPicker(ctx, model, trusted);
			await writeSm.flush();
			const errors = writeSm.drainErrors();
			for (const e of errors) ctx.ui.notify(`settings write failed (${e.scope}): ${e.error.message}`, "error");
			if (!model.changed || errors.length > 0) return;
			ctx.ui.notify("Settings saved; reloading", "info");
			await ctx.reload();
		},
	});
}
