export class InvalidGameDataError extends Error {}

/**
 * Original technical formula:
 *   f(S) = 1 / (1 + e^(-k * S * ((T1 - T2) / (T1 + T2))))
 *
 * T1 = T2 = 0 (no scoring yet) is treated as a coin flip (0.5) rather than
 * dividing by zero. S may be 0 (game hasn't started) or exceed 1 (overtime).
 */
export function computeTechnicalProbability(k: number, S: number, T1: number, T2: number): number {
  if (![k, S, T1, T2].every(Number.isFinite)) {
    throw new InvalidGameDataError("k, S, T1, and T2 must all be finite numbers.");
  }
  if (T1 < 0 || T2 < 0) {
    throw new InvalidGameDataError("Team scores cannot be negative.");
  }

  if (T1 === 0 && T2 === 0) {
    return 0.5;
  }

  const scoreDifferential = (T1 - T2) / (T1 + T2);
  return 1 / (1 + Math.exp(-k * S * scoreDifferential));
}
