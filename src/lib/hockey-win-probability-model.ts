/**
 * Hockey (NHL) win-probability model — a logistic regression fit against
 * 1,312 completed 2024-25 NHL games with `scripts/backtest-hockey-model.ts`:
 * 56.7% in-sample accuracy on a single "eloDiff" feature (home minus away
 * scoring differential, computed only from each team's games strictly
 * before the one being predicted). Lower than football's or basketball's
 * backtest accuracy, consistent with hockey being a higher-variance,
 * lower-scoring sport where a single feature explains less of the outcome.
 *
 * `playerRatingDiff` ships zero-weighted, same rationale as the football
 * and basketball models.
 *
 * Coefficients are fixed at this version; retraining produces a new
 * version (bump HOCKEY_MODEL_VERSION) rather than mutating these in place.
 */

export const HOCKEY_MODEL_VERSION = "1.0.0-hockey";

/** Games of season history a team needs before its stats are trusted. */
export const HOCKEY_MIN_GAMES_HISTORY = 3;

/** Read-only spec for this model version — surfaced on the model version detail page. */
export const HOCKEY_MODEL_SPEC = {
  version: HOCKEY_MODEL_VERSION,
  name: "Hockey two-feature win-probability model",
  modelType: "Logistic regression",
  target: "P(home team wins)",
  trainedAccuracy: 0.5671,
  minGamesHistory: HOCKEY_MIN_GAMES_HISTORY,
  intercept: 0.2585,
  coefficients: [
    { feature: "eloDiff", label: "Scoring-differential difference", weight: 0.2557 },
    { feature: "playerRatingDiff", label: "Player-rating difference", weight: 0 },
  ],
  backtest: {
    season: 2025,
    gamesUsed: 1312,
    script: "scripts/backtest-hockey-model.ts",
  },
} as const;

export interface HockeyWinProbabilityFeatures {
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
 * `HOCKEY_MIN_GAMES_HISTORY` games of season history.
 */
export function computeHockeyWinProbability(features: HockeyWinProbabilityFeatures): number {
  const { intercept, coefficients } = HOCKEY_MODEL_SPEC;
  const byFeature = Object.fromEntries(coefficients.map((c) => [c.feature, c.weight])) as Record<
    keyof HockeyWinProbabilityFeatures,
    number
  >;

  const logit = intercept + byFeature.eloDiff * features.eloDiff + byFeature.playerRatingDiff * features.playerRatingDiff;

  return clip01(1 / (1 + Math.exp(-logit)));
}
