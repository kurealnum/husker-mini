import { InvalidGameDataError } from "./technical-formula";
import type { ThreeWayProbabilities } from "./soccer-win-probability-model";

export const SOCCER_TECHNICAL_ANALYSIS_VERSION = "1.0.0-soccer";

/**
 * Soccer's contest-state formula: a three-outcome goal-difference model
 * with a time-remaining term, replacing the shared score-ratio formula
 * (`computeTechnicalProbability`, `src/lib/technical-formula.ts`), which
 * (a) only produces a single binary probability and (b) saturates at
 * soccer's low scores the same way it does for hockey.
 *
 *   U_home = k * S * (T1 - T2)
 *   U_away = -k * S * (T1 - T2)
 *   U_draw = 0  (reference class)
 *   P(outcome) = softmax(U_home, U_away, U_draw)
 *
 * `S` (game progress — see the soccer-specific progress model in
 * `src/lib/sports/espn-provider.ts`, 0 at kickoff to 1 at 90 minutes, may
 * exceed 1 in stoppage time) is the time-remaining term: at 0-0 or any
 * tied progress point the three outcomes start even (all utilities 0,
 * softmax gives 1/3 each), and as either the goal difference or the
 * elapsed time grows, the leading team's win probability rises while the
 * draw probability falls — a scoreless match with 89 minutes gone is far
 * more likely to stay a draw than one at kickoff. The three probabilities
 * always sum to 1 by construction (softmax), never needing a separate
 * normalization step to get wrong.
 */
export function computeSoccerTechnicalProbabilities(k: number, S: number, T1: number, T2: number): ThreeWayProbabilities {
  if (![k, S, T1, T2].every(Number.isFinite)) {
    throw new InvalidGameDataError("k, S, T1, and T2 must all be finite numbers.");
  }
  if (T1 < 0 || T2 < 0) {
    throw new InvalidGameDataError("Team scores cannot be negative.");
  }

  const goalDiff = T1 - T2;
  const homeUtility = k * S * goalDiff;
  const awayUtility = -homeUtility;

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
