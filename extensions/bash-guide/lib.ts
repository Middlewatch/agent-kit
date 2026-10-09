/** The `<bash>` section body: the guide text, or nothing when bash is not an active tool. */
export function bashSection(guide: string, selectedTools: readonly string[] | undefined): string | undefined {
	const body = guide.trim();
	if (!body || !selectedTools?.includes("bash")) return undefined;
	return body;
}
