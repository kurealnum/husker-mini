import { InvalidGameDataError } from "./technical-formula";

export const TENNIS_TECHNICAL_ANALYSIS_VERSION = "1.0.0-tennis";

/**
 * Tennis's contest-state formula: a set-difference model with a
 * time-remaining term, replacing the shared score-ratio formula for the
 * same reason as hockey and soccer — sets won are low integers (0-3), so
 * a 1-0 set lead and a 2-0 set lead would otherwise both read as the same
 * ratio (1). `T1`/`T2` here are sets won, not games or points — a set
 * lead is the coarsest, most decisive signal available without parsing
 * live game/point state, which ESPN's tennis API doesn't expose the way
 * clocked sports expose a running clock (see `TennisSportsProvider`'s doc
 * comment for the sets-based progress approximation this pairs with).
 *
 *   f(S) = 1 / (1 + e^(-k * S * (T1 - T2)))
 */
export function computeTennisTechnicalProbability(k: number, S: number, T1: number, T2: number): number {
  if (![k, S, T1, T2].every(Number.isFinite)) {
    throw new InvalidGameDataError("k, S, T1, and T2 must all be finite numbers.");
  }
  if (T1 < 0 || T2 < 0) {
    throw new InvalidGameDataError("Set counts cannot be negative.");
  }

  if (T1 === 0 && T2 === 0) {
    return 0.5;
  }

  return 1 / (1 + Math.exp(-k * S * (T1 - T2)));
}
