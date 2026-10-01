/**
 * ask-user-question: the `ask_user_question` tool, a tabbed questionnaire the
 * model puts to the user when a decision is the user's to make. lib.ts holds
 * the state machine and view.ts the dialog; this file is the pi registration.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isKeyRelease, isKeyRepeat, matchesKey, type OverlayHandle, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  answerText,
  DECLINE_MESSAGE,
  formatResult,
  MAX_HEADER_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_OPTIONS,
  MIN_OPTIONS,
  normalizeQuestions,
  type Question,
  Questionnaire,
  type Result,
  validateQuestions,
} from "./lib.ts";
import { COLLAPSE_KEY, QuestionnaireView } from "./view.ts";

const TOOL_NAME = "ask_user_question";

const Parameters = Type.Object({
  questions: Type.Array(
    Type.Object({
      question: Type.String({ description: "The full question, ending with a question mark." }),
      header: Type.String({ maxLength: MAX_HEADER_LENGTH, description: `Tab label, at most ${MAX_HEADER_LENGTH} characters.` }),
      options: Type.Array(
        Type.Object({
          label: Type.String({ maxLength: MAX_LABEL_LENGTH, description: `1-5 words, at most ${MAX_LABEL_LENGTH} characters.` }),
          description: Type.String({ description: "What the choice means or trades off." }),
          preview: Type.Optional(
            Type.String({ description: "Markdown shown beside the option while it is focused: a mockup, code, a diagram, a config. Single-select only." }),
          ),
        }),
        { minItems: MIN_OPTIONS, maxItems: MAX_OPTIONS },
      ),
      multiSelect: Type.Optional(Type.Boolean({ description: "Let the user pick several options." })),
    }),
    { minItems: 1, description: "Every pending question, in one call." },
  ),
});

/** The dialog needs pi's terminal UI; print, JSON, and RPC hosts cannot draw it. */
function reconcile(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const active = pi.getActiveTools();
  const has = active.includes(TOOL_NAME);
  if (ctx.mode !== "tui" && has) pi.setActiveTools(active.filter((name) => name !== TOOL_NAME));
  else if (ctx.mode === "tui" && !has) pi.setActiveTools([...active, TOOL_NAME]);
}

export default function askUserQuestion(pi: ExtensionAPI): void {
  // session_start sets availability before pi snapshots the prompt; the per-run check covers later changes.
  pi.on("session_start", (_event, ctx) => reconcile(pi, ctx));
  pi.on("before_agent_start", (_event, ctx) => reconcile(pi, ctx));

  pi.registerTool({
    name: TOOL_NAME,
    label: "Ask User Question",
    // The dialog blocks on a person, so scripts must not call it.
    exposure: "model-only",
    description:
      'Ask the user structured questions and wait for the answers. Each question offers 2-4 options; a "Type something." row for a free-text answer is added to every question, so do not author an "Other" option.',
    promptSnippet: "Ask the user structured questions (2-4 options each) when a decision is the owner's to make",
    promptGuidelines: [
      'Use ask_user_question when work is blocked on a decision only the user can make: an owner gate, or a ruling between options with real trade-offs. For an underspecified request, implement the most-supported reading and state the assumption rather than asking. Each question should have 2-4 options with a label (1-5 words) and a description explaining what the choice means. The user can additionally type a custom answer via the automatically appended "Type something." row on every question.',
      "Set multiSelect: true when multiple answers are valid.",
      "Provide an options[].preview markdown string when an option benefits from richer side-by-side context (mockups, code snippets, diagrams, configs).",
      'If you recommend a specific option, make that the first option and append "(Recommended)" to its label.',
    ],
    parameters: Parameters,

    async execute(_id, params, _signal, _onUpdate, ctx) {
      const reply = (text: string, details: Result) => ({ content: [{ type: "text" as const, text }], details });
      const declined: Result = { answers: [], cancelled: true };
      if (ctx.mode !== "tui") {
        return reply("Error: this client cannot draw the questionnaire, so the user never saw it. Ask the questions as plain text instead.", declined);
      }
      const questions = normalizeQuestions(params.questions as Question[]);
      const invalid = validateQuestions(questions);
      if (invalid) return reply(invalid, declined);

      let view: QuestionnaireView | undefined;
      let overlay: OverlayHandle | undefined;
      let toldHowToReopen = false;
      // pi routes no input to a hidden overlay, so the collapse key is also caught at the terminal to bring it back.
      const removeListener = ctx.ui.onTerminalInput((data) => {
        if (!overlay || (!overlay.isHidden() && !overlay.isFocused())) return undefined;
        if (!matchesKey(data, COLLAPSE_KEY)) return undefined;
        // Kitty-protocol terminals report repeat and release too; act on the press only.
        if (!isKeyRelease(data) && !isKeyRepeat(data)) view?.toggleCollapsed();
        return { consume: true };
      });
      try {
        if (process.stdout.isTTY) process.stdout.write("\x07");
        const result = await ctx.ui.custom<Result>(
          (tui, theme, keybindings, done) =>
            (view = new QuestionnaireView({
              tui,
              theme,
              keybindings,
              questionnaire: new Questionnaire(questions),
              done,
              setHidden: (hidden) => {
                overlay?.setHidden(hidden);
                if (hidden && !toldHowToReopen) ctx.ui.notify("Questions hidden; Ctrl+] brings them back", "info");
                toldHowToReopen ||= hidden;
              },
            })),
          {
            overlay: true,
            overlayOptions: { anchor: "bottom-center", width: "100%", maxHeight: "100%", margin: { left: 0, right: 0, bottom: 0 } },
            onHandle: (handle) => {
              overlay = handle;
            },
          },
        );
        return reply(formatResult(result, questions), result);
      } finally {
        removeListener();
      }
    },

    renderCall(args, theme) {
      const questions = (args.questions as Question[] | undefined) ?? [];
      const headers = questions.map((question) => question.header).filter(Boolean).join(", ");
      return new Text(
        theme.fg("toolTitle", theme.bold("Ask ")) + theme.fg("muted", `${questions.length} question${questions.length === 1 ? "" : "s"}`) + (headers ? theme.fg("dim", ` (${headers})`) : ""),
        0,
        0,
      );
    },

    renderResult(result, _options, theme) {
      const details = result.details as Result | undefined;
      const first = result.content[0];
      // Declines and errors both arrive as a cancelled result; the text says which.
      if (!details || details.cancelled) return new Text(theme.fg("warning", first?.type === "text" ? first.text : DECLINE_MESSAGE), 0, 0);
      const lines = details.answers.map((answer) => `${theme.fg("success", "✓ ")}${theme.fg("muted", `${answer.question} `)}${answerText(answer)}${answer.notes ? theme.fg("dim", ` (${answer.notes})`) : ""}`);
      if (details.globalNote) lines.push(theme.fg("dim", `note: ${details.globalNote}`));
      return new Text(lines.join("\n"), 0, 0);
    },
  });
}
