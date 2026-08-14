/**
 * Golf field win-probability model — the only N-competitor (not two-way or
 * three-way) model in this app. A softmax over each player's live
 * strokes-behind-the-leader, fit and backtested with
 * `scripts/backtest-golf-model.ts` against 2,250 (player, round-checkpoint)
 * samples pooled from 6 completed 2025 PGA tournaments: 98.9% in-sample
 * accuracy — a genuinely high number, but expected and not a sign of an
 * unusually good model: in a ~70-150 player field, the overwhelming
 * majority of samples at any checkpoint are players many strokes behind
 * who almost never win, so "predict not-the-winner" is trivially correct
 * for most of them. Treat this as confirmation the feature has the right
 * sign and rough scale, not as a precision claim.
 *
 * World ranking, recent finishes, and course history (all named in the
 * issue scope) are **not** used: ESPN exposes no working world-ranking
 * endpoint for golf — `/rankings` 404s at both the sport and tour level,
 * confirmed live. Live strokes-behind-the-leader is the only real signal
 * this data source provides; the others are documented gaps, not
 * silently dropped.
 *
 * Coefficients are fixed at this version; retraining produces a new
 * version (bump GOLF_MODEL_VERSION) rather than mutating these in place.
 */

export const GOLF_MODEL_VERSION = "1.0.0-golf";

export const GOLF_MODEL_SPEC = {
  version: GOLF_MODEL_VERSION,
  name: "Golf field strokes-behind-leader model",
  modelType: "Softmax over per-player logistic utility",
  target: "P(player wins the tournament)",
  trainedAccuracy: 0.9893,
  intercept: -0.5028,
  // Utility per player = intercept + weight * (leader's cumulative score - this player's cumulative score).
  // A player exactly tied for the lead scores 0 here; a player N strokes
  // behind scores increasingly negative, per this weight.
  strokesBehindWeight: 0.8774,
  backtest: {
    tournaments: 6,
    samples: 2250,
    script: "scripts/backtest-golf-model.ts",
    caveat: "high accuracy driven by class imbalance (most field members are far behind at any checkpoint) — a sign-and-scale check, not a precision claim",
  },
} as const;

export interface FieldCompetitorScore {
  id: string;
  /** This player's cumulative score relative to par (lower is better). */
  scoreRelativeToPar: number;
}

/**
 * Computes a win probability for every player in the field, always
 * summing to exactly 1 by construction (softmax). Score direction is
 * inverted from every other sport in this app — a **lower** score is
 * better in golf, honored here by using `leaderScore - playerScore`
 * (negative for everyone behind the leader) as the utility input, per the
 * league registry's `scoreSemantics.higherWins: false`.
 */
export function computeGolfFieldWinProbabilities(field: FieldCompetitorScore[]): Map<string, number> {
  if (field.length === 0) return new Map();

  const leaderScore = Math.min(...field.map((p) => p.scoreRelativeToPar));
  const { intercept, strokesBehindWeight } = GOLF_MODEL_SPEC;

  const utilities = field.map((p) => ({
    id: p.id,
    utility: intercept + strokesBehindWeight * (leaderScore - p.scoreRelativeToPar),
  }));

  const expUtilities = utilities.map((u) => Math.exp(u.utility));
  const total = expUtilities.reduce((sum, v) => sum + v, 0);

  return new Map(utilities.map((u, i) => [u.id, expUtilities[i] / total]));
}
