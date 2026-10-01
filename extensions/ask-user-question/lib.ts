/**
 * ask-user-question core: validation, the questionnaire state machine, and
 * the text the model gets back. No pi imports, so `node --test lib.test.ts`
 * runs without an install. view.ts draws this state and feeds it keys.
 */

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;
export const MAX_HEADER_LENGTH = 16;
export const MAX_LABEL_LENGTH = 60;

/** Row appended to every question: a free-text answer. */
export const OTHER_LABEL = "Type something.";
/** Row appended to multi-select questions: commit the checked boxes. */
export const NEXT_LABEL = "Next";
/** Labels the model may not use for its own options. */
export const RESERVED_LABELS: readonly string[] = ["Other", OTHER_LABEL, NEXT_LABEL];

export interface Option {
  label: string;
  description: string;
  preview?: string;
}

export interface Question {
  question: string;
  header: string;
  options: Option[];
  multiSelect?: boolean;
}

export interface Answer {
  questionIndex: number;
  question: string;
  /** `option`: one authored option. `custom`: typed text. `multi`: checked boxes, in `selected`. */
  kind: "option" | "custom" | "multi";
  answer: string | null;
  selected?: string[];
  notes?: string;
}

export interface Result {
  answers: Answer[];
  cancelled: boolean;
  /** Note written on the Submit tab, covering the whole questionnaire. */
  globalNote?: string;
}

// ---------------------------------------------------------------------------
// Tool boundary
// ---------------------------------------------------------------------------

const clean = (text: string): string => text.replace(/\r\n/g, "\n").replace(/\r/g, "");

/**
 * Strip carriage returns from every string the user will see. Some models
 * emit a bare CR inside tool arguments, and a raw CR in a rendered row moves
 * the terminal cursor to column 0.
 */
export function normalizeQuestions(questions: readonly Question[]): Question[] {
  return questions.map((q) => ({
    ...q,
    question: clean(q.question),
    header: clean(q.header),
    options: q.options.map((o) => ({
      ...o,
      label: clean(o.label),
      description: clean(o.description),
      ...(typeof o.preview === "string" ? { preview: clean(o.preview) } : {}),
    })),
  }));
}

/** The first problem with a questionnaire, as the error the model sees; undefined when it is valid. */
export function validateQuestions(questions: readonly Question[]): string | undefined {
  if (questions.length === 0) return "Error: at least one question is required";
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.question)) return "Error: question text must be unique within a call";
    seen.add(q.question);
    if (q.options.length < MIN_OPTIONS) return `Error: each question needs at least ${MIN_OPTIONS} options`;
    const labels = new Set<string>();
    for (const o of q.options) {
      if (RESERVED_LABELS.includes(o.label)) return `Error: option label "${o.label}" is reserved (${RESERVED_LABELS.join(", ")})`;
      if (labels.has(o.label)) return "Error: option labels must be unique within a question";
      labels.add(o.label);
    }
  }
  return undefined;
}

export const DECLINE_MESSAGE = "User declined to answer questions";
const NO_INPUT = "(no input)";

export function answerText(a: Answer): string {
  if (a.kind === "multi") return a.selected && a.selected.length > 0 ? a.selected.join(", ") : NO_INPUT;
  return a.answer && a.answer.length > 0 ? a.answer : NO_INPUT;
}

/**
 * The tool result text. One line per question, including the ones the user
 * skipped, so a partial submission is visible as partial. A cancelled or
 * empty result is the decline message.
 */
export function formatResult(result: Result, questions: readonly Question[]): string {
  if (result.cancelled || (result.answers.length === 0 && !result.globalNote)) return DECLINE_MESSAGE;
  const lines = questions.map((q, i) => {
    const a = result.answers.find((x) => x.questionIndex === i);
    if (!a) return `- "${q.question}" = (not answered)`;
    return `- "${q.question}" = "${answerText(a)}"${a.notes ? `; user notes: ${a.notes}` : ""}`;
  });
  if (result.globalNote) lines.push(`Note for the whole questionnaire: ${result.globalNote}`);
  return `User answers:\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

export type Row = { kind: "option"; index: number } | { kind: "other" } | { kind: "next" };

const wrap = (index: number, total: number): number => (total <= 0 ? 0 : ((index % total) + total) % total);

/**
 * One questionnaire in progress. Several questions get a tab each plus a
 * Submit tab at index `questions.length`; a single question has no tabs and
 * finishes on its first answer. `result` is set once the user is done.
 */
export class Questionnaire {
  readonly questions: readonly Question[];
  /** More than one question: tabs and a Submit tab. */
  readonly tabbed: boolean;
  tab = 0;
  /** Focused row on a question tab. */
  row = 0;
  /** Focused row on the Submit tab: 0 submit, 1 cancel. */
  submitRow = 0;
  notesOpen = false;
  collapsed = false;
  result: Result | undefined;
  readonly answers = new Map<number, Answer>();
  /** Checked option indices per multi-select tab. */
  private readonly checked = new Map<number, Set<number>>();
  /** Typed-answer drafts per tab; an empty string overrides an older custom answer. */
  private readonly drafts = new Map<number, string>();
  /** Notes per tab, kept apart from answers so a note alone does not answer a question. */
  private readonly notes = new Map<number, string>();

  constructor(questions: readonly Question[]) {
    this.questions = questions;
    this.tabbed = questions.length > 1;
  }

  get onSubmitTab(): boolean {
    return this.tabbed && this.tab === this.questions.length;
  }

  get question(): Question | undefined {
    return this.questions[this.tab];
  }

  rows(tab = this.tab): Row[] {
    const q = this.questions[tab];
    if (!q) return [];
    const rows: Row[] = q.options.map((_, index) => ({ kind: "option", index }));
    rows.push({ kind: "other" });
    if (q.multiSelect) rows.push({ kind: "next" });
    return rows;
  }

  get focused(): Row | undefined {
    return this.onSubmitTab ? undefined : this.rows()[this.row];
  }

  /** The focused row is the free-text row, so keys are text. */
  get typing(): boolean {
    return !this.notesOpen && this.focused?.kind === "other";
  }

  isChecked(tab: number, index: number): boolean {
    return this.checked.get(tab)?.has(index) ?? false;
  }

  draft(tab = this.tab): string {
    const draft = this.drafts.get(tab);
    if (draft !== undefined) return draft;
    const answer = this.answers.get(tab);
    return answer?.kind === "custom" && answer.answer ? answer.answer : "";
  }

  setDraft(text: string): void {
    this.drafts.set(this.tab, text);
  }

  note(tab = this.tab): string {
    return this.notes.get(tab) ?? this.answers.get(tab)?.notes ?? "";
  }

  /** Headers of the questions with no answer yet. */
  unanswered(): string[] {
    return this.questions.flatMap((q, i) => (this.answers.has(i) ? [] : [q.header || `Q${i + 1}`]));
  }

  /** Up or down. Wraps on a question tab; flips between the two rows of the Submit tab. */
  move(delta: number): void {
    if (this.onSubmitTab) this.submitRow = wrap(this.submitRow + delta, 2);
    else this.row = wrap(this.row + delta, this.rows().length);
  }

  switchTab(delta: number): void {
    if (this.tabbed) this.goTo(wrap(this.tab + delta, this.questions.length + 1));
  }

  private goTo(tab: number): void {
    this.tab = tab;
    this.row = 0;
    this.submitRow = 0;
    this.notesOpen = false;
  }

  /** Space on a multi-select option: flip its box. The checked set is the answer; an empty set is no answer. */
  toggle(): void {
    const q = this.question;
    const row = this.focused;
    if (!q?.multiSelect || row?.kind !== "option") return;
    const set = this.checked.get(this.tab) ?? new Set<number>();
    if (!set.delete(row.index)) set.add(row.index);
    this.checked.set(this.tab, set);
    if (set.size > 0) this.setAnswer({ kind: "multi", answer: null, selected: this.selectedLabels() });
    else if (this.answers.get(this.tab)?.kind === "multi") this.answers.delete(this.tab);
  }

  /**
   * Enter. On an option: answer and advance (single-select) or flip the box
   * (multi-select). On the free-text row: answer with the draft, or withdraw
   * a typed answer when the draft is empty. On Next: commit the checked
   * boxes. On the Submit tab: submit or cancel.
   */
  confirm(): void {
    if (this.onSubmitTab) {
      this.finish(this.submitRow === 1);
      return;
    }
    const q = this.question;
    const row = this.focused;
    if (!q || !row) return;
    if (row.kind === "other") {
      const text = this.draft();
      this.drafts.delete(this.tab);
      if (text.trim().length === 0) {
        if (this.answers.get(this.tab)?.kind === "custom") this.answers.delete(this.tab);
        return;
      }
      // A typed answer replaces the checkboxes rather than joining them.
      this.checked.delete(this.tab);
      this.setAnswer({ kind: "custom", answer: text });
    } else if (row.kind === "next") {
      // Next with nothing checked keeps a typed answer instead of replacing it with an empty selection.
      if (this.selectedLabels().length > 0 || this.answers.get(this.tab)?.kind !== "custom") {
        this.setAnswer({ kind: "multi", answer: null, selected: this.selectedLabels() });
      }
    } else if (q.multiSelect) {
      this.toggle();
      return;
    } else {
      this.setAnswer({ kind: "option", answer: q.options[row.index]!.label });
    }
    if (!this.tabbed) this.finish(false);
    else this.goTo(Math.min(this.tab + 1, this.questions.length));
  }

  /** Open the note for this tab; returns the text to edit. On the Submit tab this is the global note. */
  openNotes(): string {
    this.notesOpen = true;
    return this.note();
  }

  closeNotes(text: string): void {
    this.notesOpen = false;
    const trimmed = text.trim();
    const answer = this.answers.get(this.tab);
    if (trimmed) this.notes.set(this.tab, trimmed);
    else this.notes.delete(this.tab);
    if (answer) {
      const { notes: _dropped, ...rest } = answer;
      this.answers.set(this.tab, trimmed ? { ...rest, notes: trimmed } : rest);
    }
  }

  cancel(): void {
    this.finish(true);
  }

  private selectedLabels(): string[] {
    const set = this.checked.get(this.tab);
    return this.question!.options.filter((_, index) => set?.has(index)).map((o) => o.label);
  }

  private setAnswer(answer: Pick<Answer, "kind" | "answer" | "selected">): void {
    const notes = this.notes.get(this.tab);
    this.answers.set(this.tab, { questionIndex: this.tab, question: this.question!.question, ...answer, ...(notes ? { notes } : {}) });
  }

  private finish(cancelled: boolean): void {
    const globalNote = this.notes.get(this.questions.length);
    this.result = {
      answers: this.questions.flatMap((_, i) => this.answers.get(i) ?? []),
      cancelled,
      ...(globalNote ? { globalNote } : {}),
    };
  }
}

// ---------------------------------------------------------------------------
// Layout arithmetic
// ---------------------------------------------------------------------------

/**
 * Which tabs fit in `width`. Returns the inclusive range to show: everything
 * when it fits, otherwise the widest run around `active`. `widths` are the
 * visible widths of the tab labels; a neighbor costs one separating column
 * and a hidden side costs two for its ellipsis.
 */
export function tabWindow(widths: readonly number[], active: number, width: number): [number, number] {
  const last = widths.length - 1;
  const rowWidth = (lo: number, hi: number): number => {
    let total = 3 + 2 + (hi - lo);
    for (let i = lo; i <= hi; i++) total += widths[i]!;
    return total + (lo > 0 ? 2 : 0) + (hi < last ? 2 : 0);
  };
  let lo = 0;
  let hi = last;
  if (rowWidth(lo, hi) <= width) return [lo, hi];
  lo = hi = Math.max(0, Math.min(active, last));
  for (;;) {
    if (hi < last && rowWidth(lo, hi + 1) <= width) hi++;
    else if (lo > 0 && rowWidth(lo - 1, hi) <= width) lo--;
    else return [lo, hi];
  }
}

/**
 * First visible row of a `total`-row body shown through `visible` rows,
 * centered on the focused range and clamped to the body.
 */
export function scrollStart(focus: [number, number] | undefined, visible: number, total: number): number {
  if (!focus) return 0;
  const ideal = focus[0] - Math.floor(Math.max(0, visible - (focus[1] - focus[0])) / 2);
  return Math.max(0, Math.min(ideal, total - visible));
}
