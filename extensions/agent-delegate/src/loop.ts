/**
 * Deterministic child-side loop detection (pure, no I/O). Two guards, both
 * with pinned extension-owned thresholds:
 *
 * - Tool-call cycle: a cycle of length ≤ CYCLE_MAX_LEN repeated
 *   CYCLE_REPEAT_THRESHOLD consecutive times halts the child.
 * - Identical call→error streak: ERROR_STREAK_NUDGE consecutive errors on
 *   the identical call draw one corrective nudge (the blocked call's
 *   reason); re-issuing the call unchanged after the nudge halts at
 *   ERROR_STREAK_HALT. Changed arguments or a success reset the streak.
 */

export const CYCLE_MAX_LEN = 5;
export const CYCLE_REPEAT_THRESHOLD = 5;
export const ERROR_STREAK_NUDGE = 3;
export const ERROR_STREAK_HALT = 4;

export type LoopVerdict =
  | { kind: "ok" }
  | { kind: "nudge"; message: string }
  | { kind: "halt"; reason: string };

function callKey(name: string, args: unknown): string {
  return `${name}\0${JSON.stringify(args) ?? "undefined"}`;
}

interface ErrorStreak {
  key: string;
  name: string;
  errors: number;
  nudged: boolean;
}

export class LoopDetector {
  private history: string[] = [];
  private streak: ErrorStreak | undefined;
  private halted: LoopVerdict | undefined;

  observeCall(name: string, args: unknown): LoopVerdict {
    if (this.halted) return this.halted;
    const key = callKey(name, args);

    if (this.streak && this.streak.key === key && this.streak.errors >= ERROR_STREAK_NUDGE) {
      if (!this.streak.nudged) {
        this.streak.nudged = true;
        return {
          kind: "nudge",
          message:
            `The ${name} call with these exact arguments has failed ${this.streak.errors} times in a row. ` +
            "This call is blocked once: change the arguments or the approach — re-issuing it unchanged will halt the child.",
        };
      }
      this.halted = {
        kind: "halt",
        reason:
          `identical ${name} call re-issued unchanged after the corrective nudge ` +
          `(${ERROR_STREAK_HALT} consecutive identical attempts ending in error)`,
      };
      return this.halted;
    }

    this.history.push(key);
    const cyclePeriod = this.detectCycle();
    if (cyclePeriod !== undefined) {
      this.halted = {
        kind: "halt",
        reason:
          `tool-call cycle detected: the last ${cyclePeriod * CYCLE_REPEAT_THRESHOLD} calls repeat ` +
          `a length-${cyclePeriod} cycle ${CYCLE_REPEAT_THRESHOLD} consecutive times`,
      };
      return this.halted;
    }
    return { kind: "ok" };
  }

  observeResult(name: string, args: unknown, isError: boolean, _resultText: string): void {
    const key = callKey(name, args);
    if (!isError) {
      this.streak = undefined;
      return;
    }
    if (this.streak && this.streak.key === key) {
      this.streak.errors += 1;
    } else {
      this.streak = { key, name, errors: 1, nudged: false };
    }
  }

  /** Smallest period p ≤ CYCLE_MAX_LEN whose block repeats CYCLE_REPEAT_THRESHOLD times at the end of history. */
  private detectCycle(): number | undefined {
    for (let period = 1; period <= CYCLE_MAX_LEN; period += 1) {
      const span = period * CYCLE_REPEAT_THRESHOLD;
      if (this.history.length < span) continue;
      const tail = this.history.slice(-span);
      let repeats = true;
      for (let index = period; index < span && repeats; index += 1) {
        if (tail[index] !== tail[index % period]) repeats = false;
      }
      if (repeats) return period;
    }
    return undefined;
  }
}
