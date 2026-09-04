/** Session-storage stub for unit wiring; real persistence is covered by conformance. */
export function sessionStub() {
  const entries: {
    type: string;
    customType: string;
    data: unknown;
    id: string;
  }[] = [];
  return {
    entries,
    appendEntry(customType: string, data: unknown) {
      entries.push({
        type: "custom",
        customType,
        data,
        id: String(entries.length),
      });
    },
    context(ctx: any = {}) {
      return {
        hasUI: true,
        ui: { notify() {} },
        ...ctx,
        sessionManager: {
          getSessionId: () => "unit-session",
          getLeafId: () => entries.at(-1)?.id ?? null,
          getBranch: () => [...entries],
        },
      };
    },
  };
}
