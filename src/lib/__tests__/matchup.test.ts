import { describe, expect, it } from "vitest";

import { computeMatchup, offensiveDefensiveSplit } from "@/lib/analytics/matchup";
import type { CompletedGame, TeamStrength } from "@/lib/analytics/team-strength";

function game(teamScore: number, opponentScore: number): CompletedGame {
  return {
    opponentId: "x",
    isHome: true,
    teamScore,
    opponentScore,
    won: teamScore > opponentScore,
    date: "2026-01-01",
  };
}

function strength(opponentAdjustedStrength: number): TeamStrength {
  return {
    winRate: 0.5,
    recentWinRate: 0.5,
    scoringDifferential: 0,
    opponentAdjustedStrength,
    homeWinRate: null,
    awayWinRate: null,
  };
}

describe("offensiveDefensiveSplit", () => {
  it("averages points for and against", () => {
    const split = offensiveDefensiveSplit([game(20, 10), game(30, 20)]);
    expect(split.avgPointsFor).toBeCloseTo(25);
    expect(split.avgPointsAgainst).toBeCloseTo(15);
  });

  it("returns zeros for an empty log", () => {
    expect(offensiveDefensiveSplit([])).toEqual({ avgPointsFor: 0, avgPointsAgainst: 0 });
  });
});

describe("computeMatchup", () => {
  it("computes composite edge from opponent-adjusted strength difference", () => {
    const result = computeMatchup([], strength(10), [], strength(4));
    expect(result.compositeEdge).toBeCloseTo(6);
  });

  it("projects offensive/defensive matchups as midpoints of offense vs opposing defense", () => {
    const teamAGames = [game(30, 10), game(30, 10)]; // avgFor 30, avgAgainst 10
    const teamBGames = [game(20, 20), game(20, 20)]; // avgFor 20, avgAgainst 20

    const result = computeMatchup(teamAGames, strength(0), teamBGames, strength(0));

    expect(result.teamAOffensiveMatchup).toBeCloseTo((30 + 20) / 2);
    expect(result.teamBOffensiveMatchup).toBeCloseTo((20 + 10) / 2);
    expect(result.teamADefensiveMatchup).toBeCloseTo(result.teamBOffensiveMatchup);
    expect(result.teamBDefensiveMatchup).toBeCloseTo(result.teamAOffensiveMatchup);
  });
});
