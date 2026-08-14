import { InvalidGameDataError } from "./technical-formula";

export const HOCKEY_TECHNICAL_ANALYSIS_VERSION = "1.0.0-hockey";

/**
 * Hockey's contest-state formula: a goal-difference model with a
 * time-remaining term, replacing the shared score-ratio formula
 * (`computeTechnicalProbability`, `src/lib/technical-formula.ts`), which
 * saturates at hockey's low scores — a 1-0 lead and a 5-0 lead both give a
 * ratio of exactly 1, producing the same probability despite being very
 * different games.
 *
 *   f(S) = 1 / (1 + e^(-k * S * (T1 - T2)))
 *
 * Uses the raw goal difference instead of a ratio, so a bigger lead always
 * means a higher probability regardless of total goals scored. `S` (game
 * progress, 0 at puck-drop to 1 at regulation end, may exceed 1 in
 * overtime/shootout) is the time-remaining term: the same goal difference
 * is more decisive — and should move the probability further from 0.5 —
 * the less time is left for the trailing team to catch up.
 */
export function computeHockeyTechnicalProbability(k: number, S: number, T1: number, T2: number): number {
  if (![k, S, T1, T2].every(Number.isFinite)) {
    throw new InvalidGameDataError("k, S, T1, and T2 must all be finite numbers.");
  }
  if (T1 < 0 || T2 < 0) {
    throw new InvalidGameDataError("Team scores cannot be negative.");
  }

  if (T1 === 0 && T2 === 0) {
    return 0.5;
  }

  return 1 / (1 + Math.exp(-k * S * (T1 - T2)));
}
