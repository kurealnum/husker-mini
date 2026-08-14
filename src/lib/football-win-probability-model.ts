/**
 * Football (NFL, NCAAF) win-probability model — a logistic regression fit
 * against 272 completed 2025 NFL games, backtested with
 * `scripts/backtest-football-model.ts`: 62.1% in-sample accuracy on a
 * single "eloDiff" feature (home minus away scoring differential, computed
 * only from each team's games strictly before the one being predicted — no
 * future-game leakage).
 *
 * `playerRatingDiff` ships with a zero weight, same as MLB's still-zero
 * savePctDiff/opsDiff/eraDiff (`src/lib/win-probability-model.ts`) — it's
 * cheap to compute in the live pipeline (already derived for the combiner
 * phase) but wasn't included in this backtest, which only fetches
 * schedules (not every team's roster/gamelogs) to stay fast. Revisit once
 * that data is worth the extra fetch cost.
 *
 * Coefficients are fixed at this version; retraining produces a new
 * version (bump FOOTBALL_MODEL_VERSION) rather than mutating these in
 * place, so a prediction's `winProbabilityModelVersion` always identifies
 * the exact coefficients that produced it. NFL and NCAAF share this one
 * model rather than each getting separate coefficients — see the registry
 * comment on `ncaaf.winProbabilityModelVersion` for why.
 */

export const FOOTBALL_MODEL_VERSION = "1.0.0-football";

/** Games of season history a team needs before its stats are trusted. */
export const FOOTBALL_MIN_GAMES_HISTORY = 3;

/** Read-only spec for this model version — surfaced on the model version detail page. */
export const FOOTBALL_MODEL_SPEC = {
  version: FOOTBALL_MODEL_VERSION,
  name: "Football two-feature win-probability model",
  modelType: "Logistic regression",
  target: "P(home team wins)",
  trainedAccuracy: 0.6213,
  minGamesHistory: FOOTBALL_MIN_GAMES_HISTORY,
  intercept: 0.2029,
  coefficients: [
    { feature: "eloDiff", label: "Scoring-differential difference", weight: 0.0697 },
    { feature: "playerRatingDiff", label: "Player-rating difference", weight: 0 },
  ],
  backtest: {
    season: 2025,
    gamesUsed: 272,
    script: "scripts/backtest-football-model.ts",
  },
} as const;

export interface FootballWinProbabilityFeatures {
  /** Home team's pre-game scoring differential minus the away team's, each computed from games strictly before this one. */
  eloDiff: number;
  /** Home trailing player-rating minus away trailing player-rating. Zero-weighted for now — see file doc comment. */
  playerRatingDiff: number;
}

function clip01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Applies the fitted logistic model to the two pre-game feature
 * differences and clips the result to [0, 1]. Callers fall back to a
 * simpler estimate (a coin flip) when a team has fewer than
 * `FOOTBALL_MIN_GAMES_HISTORY` games of season history.
 */
export function computeFootballWinProbability(features: FootballWinProbabilityFeatures): number {
  const { intercept, coefficients } = FOOTBALL_MODEL_SPEC;
  const byFeature = Object.fromEntries(coefficients.map((c) => [c.feature, c.weight])) as Record<
    keyof FootballWinProbabilityFeatures,
    number
  >;

  const logit = intercept + byFeature.eloDiff * features.eloDiff + byFeature.playerRatingDiff * features.playerRatingDiff;

  return clip01(1 / (1 + Math.exp(-logit)));
}
