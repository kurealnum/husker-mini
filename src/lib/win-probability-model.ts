/**
 * MVP five-feature MLB win-probability model (linear regression), trained
 * offline on one season of boxscore data (56.5% accuracy, 0.578 ROC AUC on a
 * held-out set — see docs/espn_analytics_formulas.md for feature definitions
 * consulted by this app's ESPN analytics stage). This is the "ESPN analysis"
 * phase's model: it never looks anything up itself, only combines five
 * pre-computed home-minus-away feature differences into a probability.
 *
 * Coefficients are fixed at this version; retraining produces a new version
 * (bump ESPN_MODEL_VERSION) rather than mutating these in place, so a
 * prediction's `espnModelVersion` always identifies the exact coefficients
 * that produced it.
 */

export const ESPN_MODEL_VERSION = "1.0.0";

/** Games of season history a team needs before its stats are trusted. */
export const MIN_GAMES_HISTORY = 3;

/** Read-only spec for this model version — surfaced on the model version detail page. */
export const ESPN_MODEL_SPEC = {
  version: ESPN_MODEL_VERSION,
  name: "MVP five-feature win-probability model",
  modelType: "Linear regression",
  target: "P(home team wins)",
  trainedAccuracy: 0.565,
  trainedRocAuc: 0.578,
  minGamesHistory: MIN_GAMES_HISTORY,
  intercept: 0.5319,
  coefficients: [
    { feature: "eloDiff", label: "Elo difference", weight: 0.00063 },
    { feature: "savePctDiff", label: "Save-percentage difference", weight: -0.0952 },
    { feature: "opsDiff", label: "OPS difference", weight: 0.0494 },
    { feature: "eraDiff", label: "ERA difference", weight: -0.0174 },
    { feature: "batterRatingDiff", label: "Batter-rating difference", weight: 0.0011 },
  ],
  eloParams: { kFactor: 8, homeFieldBonus: 24, defaultRating: 1500 },
} as const;

export interface WinProbabilityFeatures {
  /** Home Elo rating minus away Elo rating, before this game. */
  eloDiff: number;
  /** Home season save percentage minus away season save percentage. */
  savePctDiff: number;
  /** Home season OPS minus away season OPS. */
  opsDiff: number;
  /** Home season ERA minus away season ERA. */
  eraDiff: number;
  /** Home trailing-10-game batter rating minus away trailing-10-game batter rating. */
  batterRatingDiff: number;
}

function clip01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Applies the trained linear model to five pre-game feature differences and
 * clips the result to [0, 1]. Callers are responsible for supplying
 * pre-game-only stats and for falling back to a simpler estimate when a team
 * has fewer than `MIN_GAMES_HISTORY` games of season history.
 */
export function computeEspnWinProbability(features: WinProbabilityFeatures): number {
  const { intercept, coefficients } = ESPN_MODEL_SPEC;
  const byFeature = Object.fromEntries(coefficients.map((c) => [c.feature, c.weight])) as Record<
    keyof WinProbabilityFeatures,
    number
  >;

  const raw =
    intercept +
    byFeature.eloDiff * features.eloDiff +
    byFeature.savePctDiff * features.savePctDiff +
    byFeature.opsDiff * features.opsDiff +
    byFeature.eraDiff * features.eraDiff +
    byFeature.batterRatingDiff * features.batterRatingDiff;

  return clip01(raw);
}
