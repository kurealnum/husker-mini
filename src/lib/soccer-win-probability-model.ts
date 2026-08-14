/**
 * Soccer win-probability model — the first three-outcome (home win / away
 * win / draw) model in this app. A multinomial logistic regression with
 * draw as the reference class (fixed utility 0):
 *
 *   U_home = aHome + bHome * eloDiff
 *   U_away = aAway + bAway * eloDiff
 *   U_draw = 0
 *   P(outcome) = softmax(U_home, U_away, U_draw)
 *
 * Fit and backtested with `scripts/backtest-soccer-model.ts` against 323
 * completed 2025-26 EPL games: 47.1% in-sample accuracy, barely above the
 * 46.7% "always predict home win" baseline. This is expected, not a bug —
 * soccer match outcomes (especially draws) are notoriously hard to predict
 * from a single scoring-differential feature; see any sports-analytics
 * literature on 1X2 market efficiency. Recorded honestly rather than
 * tuned to look better.
 *
 * `eloDiff` is the same pre-game-only feature used by every other sport's
 * model: home minus away scoring differential, computed only from each
 * team's games strictly before the one being predicted.
 *
 * Coefficients are fixed at this version; retraining produces a new
 * version (bump SOCCER_MODEL_VERSION) rather than mutating these in place.
 */

export const SOCCER_MODEL_VERSION = "1.0.0-soccer";

/** Games of season history a team needs before its stats are trusted. */
export const SOCCER_MIN_GAMES_HISTORY = 3;

export const SOCCER_MODEL_SPEC = {
  version: SOCCER_MODEL_VERSION,
  name: "Soccer three-outcome win-probability model",
  modelType: "Multinomial logistic regression (draw as reference class)",
  target: "P(home win), P(away win), P(draw)",
  trainedAccuracy: 0.4706,
  minGamesHistory: SOCCER_MIN_GAMES_HISTORY,
  coefficients: {
    home: { intercept: 0.5367, eloDiffWeight: 0.2367 },
    away: { intercept: -0.0634, eloDiffWeight: -0.1449 },
  },
  backtest: {
    season: 2025,
    league: "eng.1 (EPL)",
    gamesUsed: 323,
    outcomeCounts: { home: 151, away: 84, draw: 88 },
    script: "scripts/backtest-soccer-model.ts",
  },
} as const;

/** Three probabilities that always sum to exactly 1. */
export interface ThreeWayProbabilities {
  homeWinProbability: number;
  awayWinProbability: number;
  drawProbability: number;
}

/**
 * Applies the fitted multinomial logit to a single pre-game feature
 * (home minus away scoring differential) and returns three probabilities
 * that sum to 1 by construction (softmax normalizes automatically —
 * there is no separate clipping/normalization step to get wrong).
 */
export function computeSoccerWinProbabilities(eloDiff: number): ThreeWayProbabilities {
  const { home, away } = SOCCER_MODEL_SPEC.coefficients;
  const homeUtility = home.intercept + home.eloDiffWeight * eloDiff;
  const awayUtility = away.intercept + away.eloDiffWeight * eloDiff;

  const expHome = Math.exp(homeUtility);
  const expAway = Math.exp(awayUtility);
  const expDraw = 1;
  const total = expHome + expAway + expDraw;

  return {
    homeWinProbability: expHome / total,
    awayWinProbability: expAway / total,
    drawProbability: expDraw / total,
  };
}
