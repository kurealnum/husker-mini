/**
 * Head-to-head matchup metrics between two teams for a given game, built on
 * top of `@/lib/analytics/team-strength`'s `CompletedGame` log and
 * `TeamStrength` output.
 */
import type { CompletedGame, TeamStrength } from "./team-strength";

export interface OffensiveDefensiveSide {
  /** Average points/goals scored per game — this side's offensive output. */
  avgPointsFor: number;
  /** Average points/goals allowed per game — this side's defensive output. */
  avgPointsAgainst: number;
}

export interface MatchupAnalysis {
  /** Positive favors team A; based on opponent-adjusted strength difference. */
  compositeEdge: number;
  /** Team A's projected scoring output against team B's defense. */
  teamAOffensiveMatchup: number;
  /** Team B's projected scoring output against team A's defense. */
  teamBOffensiveMatchup: number;
  /** Team A's projected points allowed, facing team B's offense. */
  teamADefensiveMatchup: number;
  /** Team B's projected points allowed, facing team A's offense. */
  teamBDefensiveMatchup: number;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Derives average points for/against from a team's completed-game log. */
export function offensiveDefensiveSplit(games: CompletedGame[]): OffensiveDefensiveSide {
  return {
    avgPointsFor: mean(games.map((g) => g.teamScore)),
    avgPointsAgainst: mean(games.map((g) => g.opponentScore)),
  };
}

/**
 * Projects a team's scoring output against a specific opponent by averaging
 * its own offensive average with the opponent's defensive average — a simple
 * midpoint projection, not a full regression model.
 */
function projectedScoring(offense: OffensiveDefensiveSide, opponentDefense: OffensiveDefensiveSide): number {
  return (offense.avgPointsFor + opponentDefense.avgPointsAgainst) / 2;
}

/**
 * Computes the full matchup analysis for team A vs team B, given each
 * team's completed-game log and precomputed `TeamStrength` (for the
 * composite opponent-adjusted comparison).
 */
export function computeMatchup(
  teamAGames: CompletedGame[],
  teamAStrength: TeamStrength,
  teamBGames: CompletedGame[],
  teamBStrength: TeamStrength,
): MatchupAnalysis {
  const teamASplit = offensiveDefensiveSplit(teamAGames);
  const teamBSplit = offensiveDefensiveSplit(teamBGames);

  return {
    compositeEdge: teamAStrength.opponentAdjustedStrength - teamBStrength.opponentAdjustedStrength,
    teamAOffensiveMatchup: projectedScoring(teamASplit, teamBSplit),
    teamBOffensiveMatchup: projectedScoring(teamBSplit, teamASplit),
    teamADefensiveMatchup: projectedScoring(teamBSplit, teamASplit),
    teamBDefensiveMatchup: projectedScoring(teamASplit, teamBSplit),
  };
}
