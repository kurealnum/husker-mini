/**
 * Basketball (NBA, NCAAB) win-probability models — logistic regressions
 * fit against real completed games with
 * `scripts/backtest-basketball-model.ts` (NBA: 1,231 completed 2024-25
 * games, 64.8% in-sample accuracy) and `scripts/backtest-ncaab-model.ts`
 * (NCAAB: 1,997 completed 2024-25 games sampled from 120 of 360+ D1 teams,
 * 67.1% in-sample accuracy). Both use the same single feature as the
 * football model — home minus away scoring differential computed only
 * from each team's games strictly before the one being predicted — but
 * the fitted coefficients differ meaningfully between the two leagues
 * (NBA: intercept 0.2012, weight 0.0884; NCAAB: intercept 0.5839, weight
 * 0.0515), so unlike football/NCAAF, NBA and NCAAB get **separate**
 * coefficient sets rather than sharing one. NCAAB's much larger, more
 * uneven team pool plausibly explains its stronger home-court-baseline
 * intercept and shallower per-point-of-differential slope.
 *
 * `playerRatingDiff` ships zero-weighted for both, same rationale as the
 * football model (`src/lib/football-win-probability-model.ts`).
 *
 * Coefficients are fixed per version; retraining bumps the relevant
 * version string rather than mutating these in place.
 */

export const NBA_MODEL_VERSION = "1.0.0-nba-basketball";
export const NCAAB_MODEL_VERSION = "1.0.0-ncaab-basketball";

/** Games of season history a team needs before its stats are trusted. */
export const BASKETBALL_MIN_GAMES_HISTORY = 3;

export interface BasketballWinProbabilityFeatures {
  /** Home team's pre-game scoring differential minus the away team's, each computed from games strictly before this one. */
  eloDiff: number;
  /** Home trailing player-rating minus away trailing player-rating. Zero-weighted for now — see file doc comment. */
  playerRatingDiff: number;
}

interface BasketballModelSpec {
  version: string;
  name: string;
  modelType: string;
  target: string;
  trainedAccuracy: number;
  minGamesHistory: number;
  intercept: number;
  coefficients: ReadonlyArray<{ feature: keyof BasketballWinProbabilityFeatures; label: string; weight: number }>;
  backtest: { season: number; gamesUsed: number; script: string };
}

export const NBA_MODEL_SPEC: BasketballModelSpec = {
  version: NBA_MODEL_VERSION,
  name: "NBA two-feature win-probability model",
  modelType: "Logistic regression",
  target: "P(home team wins)",
  trainedAccuracy: 0.6483,
  minGamesHistory: BASKETBALL_MIN_GAMES_HISTORY,
  intercept: 0.2012,
  coefficients: [
    { feature: "eloDiff", label: "Scoring-differential difference", weight: 0.0884 },
    { feature: "playerRatingDiff", label: "Player-rating difference", weight: 0 },
  ],
  backtest: { season: 2025, gamesUsed: 1231, script: "scripts/backtest-basketball-model.ts" },
};

export const NCAAB_MODEL_SPEC: BasketballModelSpec = {
  version: NCAAB_MODEL_VERSION,
  name: "NCAAB two-feature win-probability model",
  modelType: "Logistic regression",
  target: "P(home team wins)",
  trainedAccuracy: 0.671,
  minGamesHistory: BASKETBALL_MIN_GAMES_HISTORY,
  intercept: 0.5839,
  coefficients: [
    { feature: "eloDiff", label: "Scoring-differential difference", weight: 0.0515 },
    { feature: "playerRatingDiff", label: "Player-rating difference", weight: 0 },
  ],
  backtest: { season: 2025, gamesUsed: 1997, script: "scripts/backtest-ncaab-model.ts" },
};

/** The fitted model spec for a basketball league key ("nba" or "ncaab"). */
export function getBasketballModelSpec(leagueKey: string): BasketballModelSpec {
  if (leagueKey === "nba") return NBA_MODEL_SPEC;
  if (leagueKey === "ncaab") return NCAAB_MODEL_SPEC;
  throw new Error(`No basketball win-probability model for league: ${leagueKey}`);
}

function clip01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Applies a fitted basketball model spec to the two pre-game feature
 * differences and clips the result to [0, 1]. Callers fall back to a
 * simpler estimate (a coin flip) when a team has fewer than
 * `BASKETBALL_MIN_GAMES_HISTORY` games of season history.
 */
export function computeBasketballWinProbability(
  spec: BasketballModelSpec,
  features: BasketballWinProbabilityFeatures,
): number {
  const byFeature = Object.fromEntries(spec.coefficients.map((c) => [c.feature, c.weight])) as Record<
    keyof BasketballWinProbabilityFeatures,
    number
  >;

  const logit = spec.intercept + byFeature.eloDiff * features.eloDiff + byFeature.playerRatingDiff * features.playerRatingDiff;

  return clip01(1 / (1 + Math.exp(-logit)));
}
