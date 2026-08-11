import { describe, expect, it } from "vitest";

import {
  computeTeamStrength,
  extractCompletedGames,
  homeAwayWinRate,
  recentWinRate,
  scoringDifferential,
  type CompletedGame,
} from "@/lib/analytics/team-strength";
import type { EspnScheduleEvent } from "@/lib/espn";

function makeEvent(params: {
  completed: boolean;
  selfScore: number;
  opponentScore: number;
  selfHome: boolean;
  opponentId: string;
}): EspnScheduleEvent {
  const self = {
    id: "self",
    homeAway: params.selfHome ? ("home" as const) : ("away" as const),
    team: { id: "team-a", displayName: "A", abbreviation: "A", location: "A", name: "A" },
    score: String(params.selfScore),
  };
  const opponent = {
    id: "opp",
    homeAway: params.selfHome ? ("away" as const) : ("home" as const),
    team: {
      id: params.opponentId,
      displayName: "Opp",
      abbreviation: "OP",
      location: "Opp",
      name: "Opp",
    },
    score: String(params.opponentScore),
  };

  return {
    id: "event-1",
    date: "2026-01-01",
    competitions: [
      {
        id: "event-1",
        date: "2026-01-01",
        competitors: [self, opponent],
        status: {
          type: { completed: params.completed, state: params.completed ? "post" : "pre", description: "" },
          period: 4,
          displayClock: "0:00",
        },
      },
    ],
  };
}

describe("extractCompletedGames", () => {
  it("skips games that have not completed", () => {
    const events = [
      makeEvent({ completed: false, selfScore: 10, opponentScore: 7, selfHome: true, opponentId: "b" }),
    ];
    expect(extractCompletedGames({ events }, "team-a")).toHaveLength(0);
  });

  it("extracts win/loss and home/away correctly", () => {
    const events = [
      makeEvent({ completed: true, selfScore: 21, opponentScore: 14, selfHome: true, opponentId: "b" }),
      makeEvent({ completed: true, selfScore: 10, opponentScore: 24, selfHome: false, opponentId: "c" }),
    ];
    const games = extractCompletedGames({ events }, "team-a");
    expect(games).toEqual([
      { opponentId: "b", isHome: true, teamScore: 21, opponentScore: 14, won: true },
      { opponentId: "c", isHome: false, teamScore: 10, opponentScore: 24, won: false },
    ]);
  });
});

describe("derived metrics", () => {
  const games: CompletedGame[] = [
    { opponentId: "b", isHome: true, teamScore: 21, opponentScore: 14, won: true },
    { opponentId: "c", isHome: false, teamScore: 10, opponentScore: 24, won: false },
    { opponentId: "d", isHome: true, teamScore: 30, opponentScore: 20, won: true },
  ];

  it("computes scoring differential", () => {
    expect(scoringDifferential(games)).toBeCloseTo((7 - 14 + 10) / 3);
  });

  it("computes recent win rate over a window", () => {
    expect(recentWinRate(games, 2)).toBeCloseTo(0.5);
  });

  it("computes home/away splits, null when a split is empty", () => {
    expect(homeAwayWinRate(games, true)).toBeCloseTo(1);
    expect(homeAwayWinRate(games, false)).toBeCloseTo(0);
    expect(homeAwayWinRate([], true)).toBeNull();
  });

  it("computeTeamStrength aggregates all metrics using league-wide games", () => {
    const allGames = new Map<string, CompletedGame[]>([
      ["team-a", games],
      ["b", [{ opponentId: "team-a", isHome: false, teamScore: 14, opponentScore: 21, won: false }]],
    ]);
    const result = computeTeamStrength("team-a", allGames);
    expect(result.winRate).toBeCloseTo(2 / 3);
    expect(result.scoringDifferential).toBeCloseTo((7 - 14 + 10) / 3);
    expect(result.homeWinRate).toBeCloseTo(1);
    expect(result.awayWinRate).toBeCloseTo(0);
  });

  it("returns zeroed metrics for a team with no games", () => {
    const result = computeTeamStrength("empty-team", new Map());
    expect(result).toEqual({
      winRate: 0,
      recentWinRate: 0,
      scoringDifferential: 0,
      opponentAdjustedStrength: 0,
      homeWinRate: null,
      awayWinRate: null,
    });
  });
});
