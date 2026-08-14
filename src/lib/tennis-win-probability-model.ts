/**
 * Tennis (ATP, WTA) win-probability model — a logistic regression on
 * ranking difference, fit and backtested with
 * `scripts/backtest-tennis-model.ts` against 181 completed January 2025
 * ATP matches where both players were in the current top-150: 56.9%
 * in-sample accuracy.
 *
 * The backtest (and this model) uses **current** rankings as a proxy for
 * each match's pre-match ranking, since ESPN exposes no historical ranking
 * snapshots — a documented simplification, not an oversight. Recent form
 * and head-to-head record (both named in the issue scope) are not yet
 * separate model features: ESPN's tennis data doesn't cleanly expose a
 * head-to-head endpoint, and recent form would need per-player match-log
 * fetches this backtest didn't do to stay fast. `recentFormDiff` ships
 * zero-weighted for the same reason the other sports' unused features do
 * — a documented gap, not silently wrong.
 *
 * Coefficients are fixed at this version; retraining produces a new
 * version (bump TENNIS_MODEL_VERSION) rather than mutating these in place.
 */

export const TENNIS_MODEL_VERSION = "1.0.0-tennis";

export const TENNIS_MODEL_SPEC = {
  version: TENNIS_MODEL_VERSION,
  name: "Tennis ranking-difference win-probability model",
  modelType: "Logistic regression",
  target: "P(player1 wins)",
  trainedAccuracy: 0.5691,
  intercept: -0.1614,
  coefficients: [
    { feature: "rankDiff", label: "Ranking difference (player2 rank minus player1 rank)", weight: 0.074074 },
    { feature: "recentFormDiff", label: "Recent-form difference", weight: 0 },
  ],
  backtest: {
    period: "January 2025",
    tour: "atp",
    matchesUsed: 181,
    script: "scripts/backtest-tennis-model.ts",
    caveat: "uses current rankings as a proxy for each match's pre-match ranking",
  },
} as const;

export interface TennisWinProbabilityFeatures {
  /** Player2's rank number minus player1's — positive means player1 is better-ranked (lower number = better). */
  rankDiff: number;
  /** Zero-weighted for now — see file doc comment. */
  recentFormDiff: number;
}

function clip01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Applies the fitted logistic model to the ranking-difference feature and clips the result to [0, 1]. */
export function computeTennisWinProbability(features: TennisWinProbabilityFeatures): number {
  const { intercept, coefficients } = TENNIS_MODEL_SPEC;
  const byFeature = Object.fromEntries(coefficients.map((c) => [c.feature, c.weight])) as Record<
    keyof TennisWinProbabilityFeatures,
    number
  >;

  const logit = intercept + byFeature.rankDiff * features.rankDiff + byFeature.recentFormDiff * features.recentFormDiff;

  return clip01(1 / (1 + Math.exp(-logit)));
}
