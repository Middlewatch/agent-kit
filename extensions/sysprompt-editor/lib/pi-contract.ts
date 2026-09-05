/** The slice of stock Pi's extension contract the editor depends on. */
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export type CoreSource =
  { kind: "stock" } | { kind: "inline" } | { kind: "file"; path: string };

export interface FinalProviderEvent {
  payload: unknown;
  model: { provider: string; id: string } | undefined;
}
export type FinalProviderHandler = (
  event: FinalProviderEvent,
  ctx: ExtensionContext,
) => Promise<void>;

/**
 * Observe the payload leaving for the provider. Stock Pi exposes it through
 * `before_provider_request`, which runs handlers in extension load order,
 * so a transform registered by a later extension is not seen here. The
 * model is the session's current model at request time.
 */
export function onFinalPayload(
  pi: ExtensionAPI,
  handler: FinalProviderHandler,
): void {
  pi.on("before_provider_request", async (event, ctx) => {
    await handler({ payload: event.payload, model: ctx.model }, ctx);
    return undefined;
  });
}

export function coreSource(options: {
  customPrompt?: string;
  coreSource?: CoreSource;
}): CoreSource {
  return (
    options.coreSource ?? { kind: options.customPrompt ? "inline" : "stock" }
  );
}
