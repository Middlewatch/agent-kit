/** Wiring for the persistent TUI chrome: header and footer. */
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { countEstate, type EstateSources } from "./estate.ts";
import { buildFooterLines, type FooterFacts } from "./footer.ts";
import { buildHeaderLines, type HeaderFacts } from "./header.ts";

interface StatusSource {
	getGitBranch(): string | null;
	getExtensionStatuses(): ReadonlyMap<string, string>;
	onBranchChange(callback: () => void): () => void;
}

export function collectFooterFacts(pi: ExtensionAPI, ctx: ExtensionContext, footerData: StatusSource): FooterFacts {
	let inputTokens = 0;
	let outputTokens = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let cost = 0;
	let cacheHitRate: number | undefined;

	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "message") continue;
		const message = entry.message as { role: string; usage?: any };
		if (message.role !== "assistant" && !(message.role === "toolResult" && message.usage)) continue;
		const usage = message.usage;
		if (!usage) continue;
		inputTokens += usage.input ?? 0;
		outputTokens += usage.output ?? 0;
		cacheRead += usage.cacheRead ?? 0;
		cacheWrite += usage.cacheWrite ?? 0;
		cost += usage.cost?.total ?? 0;
		if (message.role === "assistant") {
			const prompt = (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
			cacheHitRate = prompt > 0 ? ((usage.cacheRead ?? 0) / prompt) * 100 : undefined;
		}
	}

	const contextUsage = ctx.getContextUsage();
	return {
		cwd: ctx.cwd,
		home: homedir(),
		branch: footerData.getGitBranch() ?? undefined,
		sessionName: pi.getSessionName(),
		model: ctx.model?.id,
		thinking: ctx.thinkingLevel,
		contextPercent: contextUsage?.percent ?? undefined,
		contextWindow: contextUsage?.contextWindow ?? ctx.model?.contextWindow,
		inputTokens,
		outputTokens,
		cacheRead,
		cacheWrite,
		cacheHitRate,
		cost: cost || undefined,
		statuses: [...footerData.getExtensionStatuses().entries()],
	};
}

export function registerChrome(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		// Header facts stay live cheaply: estate counts refresh on a TTL,
		// the branch rides the footer's cached git watcher via shared state.
		const shared: { branch?: string } = {
			branch: await pi
				.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { timeout: 2000 })
				.then((result) => (result.code === 0 ? result.stdout.trim() : undefined))
				.catch(() => undefined),
		};
		const sources: EstateSources = {
			agentsDir: join(homedir(), ".agents"),
			piAgentDir: join(homedir(), ".pi", "agent"),
			cwd: ctx.cwd,
			projectTrusted: ctx.isProjectTrusted(),
		};
		// Skills come from pi's own accumulated list: every loaded skill
		// registers a /skill:name command. 0 also means the skill-command
		// surface is off, so degrade to omitted rather than claim zero.
		const countSkills = (): number | undefined => {
			const loaded = pi.getCommands().filter((command) => command.source === "skill").length;
			return loaded > 0 ? loaded : undefined;
		};
		let counts = { skills: countSkills(), ...countEstate(sources) };
		let countedAt = Date.now();
		const ESTATE_TTL_MS = 30_000;

		ctx.ui.setHeader((_tui, theme) => ({
			invalidate() {},
			render(width: number): string[] {
				if (Date.now() - countedAt > ESTATE_TTL_MS) {
					counts = { skills: countSkills(), ...countEstate(sources) };
					countedAt = Date.now();
				}
				const facts: HeaderFacts = { workspace: basename(ctx.cwd), branch: shared.branch, ...counts };
				return buildHeaderLines(facts, theme, width);
			},
		}));

		ctx.ui.setFooter((tui, theme, footerData) => ({
			dispose: footerData.onBranchChange(() => tui.requestRender()),
			invalidate() {},
			render(width: number): string[] {
				const facts = collectFooterFacts(pi, ctx, footerData);
				shared.branch = facts.branch ?? shared.branch;
				return buildFooterLines(facts, theme, width);
			},
		}));

		// Working indicator: the glyph's fade blocks breathing in accent.
		const th = ctx.ui.theme;
		ctx.ui.setWorkingIndicator({
			frames: ["░", "▒", "▓", "█", "▓", "▒"].map((block) => th.fg("accent", block)),
			intervalMs: 140,
		});
	});
}
