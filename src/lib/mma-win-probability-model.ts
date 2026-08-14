/**
 * MMA (UFC) win-probability model — a logistic regression on career
 * win-rate difference, fit and backtested with
 * `scripts/backtest-mma-model.ts` against 261 completed, decisive
 * (non-draw) 2025 UFC fights: 73.2% in-sample accuracy.
 *
 * The only feature is each fighter's career record
 * (`records[].summary`, e.g. "13-4-1"), read directly off the
 * scoreboard response — MMA has no roster, injury, or gamelog data at
 * all (confirmed 404 across the board; see `docs/pipelines/mma.md`).
 * The backtest — and this model — uses the record **as of now**, which
 * for a historical fight already includes that fight's own result; a
 * real, documented simplification (the same category as the tennis
 * backtest's current-rankings proxy), and likely inflates the reported
 * accuracy somewhat. Treat the number as a first-cut sanity check, not a
 * precise estimate.
 *
 * Method of victory, recent form, layoff, and weight class (all named in
 * the issue scope) are not yet separate features — ESPN's event feed
 * doesn't cleanly expose method-of-victory as structured data (only a
 * play-by-play `details` log), and weight class only meaningfully applies
 * as a same-class filter, not a model input, since Kalshi/ESPN already
 * only ever match same-weight-class opponents. Documented gaps, not
 * silently dropped.
 *
 * Coefficients are fixed at this version; retraining produces a new
 * version (bump MMA_MODEL_VERSION) rather than mutating these in place.
 */

export const MMA_MODEL_VERSION = "1.0.0-mma";

export const MMA_MODEL_SPEC = {
  version: MMA_MODEL_VERSION,
  name: "MMA career-win-rate-difference model",
  modelType: "Logistic regression",
  target: "P(fighter1 wins)",
  trainedAccuracy: 0.7318,
  intercept: 0.0715,
  coefficients: [{ feature: "winRateDiff", label: "Career win-rate difference", weight: 5.9056 }],
  backtest: {
    period: "Jan-Jun 2025",
    fightsUsed: 261,
    script: "scripts/backtest-mma-model.ts",
    caveat: "uses each fighter's current career record, which for a historical fight already includes its own result",
  },
} as const;

export interface MmaWinProbabilityFeatures {
  /** Fighter1's career win rate (wins + 0.5*draws, over total fights) minus fighter2's. */
  winRateDiff: number;
}

function clip01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Applies the fitted logistic model to the win-rate-difference feature and clips the result to [0, 1]. */
export function computeMmaWinProbability(features: MmaWinProbabilityFeatures): number {
  const { intercept, coefficients } = MMA_MODEL_SPEC;
  const logit = intercept + coefficients[0].weight * features.winRateDiff;
  return clip01(1 / (1 + Math.exp(-logit)));
}
