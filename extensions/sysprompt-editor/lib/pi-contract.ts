import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Companion Pi additions, absent from the published 0.85.0 declaration package. */
export type ScopedStartEvent = BeforeAgentStartEvent & {
  originalSystemPrompt?: string;
};
export type CoreSource =
  { kind: "stock" } | { kind: "inline" } | { kind: "file"; path: string };
export interface FinalProviderEvent {
  payload: unknown;
  model: { provider: string; id: string };
}
export type FinalProviderHandler = (
  event: FinalProviderEvent,
  ctx: ExtensionContext,
) => Promise<void>;

export function onProviderRequest(
  pi: ExtensionAPI,
  handler: FinalProviderHandler,
): void {
  // Kept at the package boundary; conformance checks this against patched source types.
  const on = pi.on as ExtensionAPI["on"] &
    ((event: "provider_request", handler: FinalProviderHandler) => void);
  on("provider_request", handler);
}

export function coreSource(options: {
  customPrompt?: string;
  coreSource?: CoreSource;
}): CoreSource {
  return (
    options.coreSource ?? { kind: options.customPrompt ? "inline" : "stock" }
  );
}
