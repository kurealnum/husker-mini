import { describe, expect, it } from "vitest";

import { computeRecentForm } from "@/lib/analytics/recent-form";
import type { CompletedGame } from "@/lib/analytics/team-strength";

function game(teamScore: number, opponentScore: number): CompletedGame {
  return {
    opponentId: "opp",
    isHome: true,
    teamScore,
    opponentScore,
    won: teamScore > opponentScore,
  };
}

describe("computeRecentForm", () => {
  it("handles an empty game log", () => {
    const form = computeRecentForm([]);
    expect(form.last5).toEqual({
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgScoringMargin: 0,
    });
    expect(form.scoringTrend).toBe(0);
    expect(form.volatility).toBe(0);
  });

  it("summarizes last-5 and last-10 windows separately", () => {
    const games = [
      game(10, 20), // loss, margin -10
      game(14, 10), // win, margin +4
      game(20, 10), // win, margin +10
      game(24, 20), // win, margin +4
      game(30, 10), // win, margin +20
      game(7, 21), // loss, margin -14
    ];
    const form = computeRecentForm(games);

    expect(form.last5.gamesPlayed).toBe(5);
    expect(form.last5.wins).toBe(4);
    expect(form.last5.losses).toBe(1);

    expect(form.last10.gamesPlayed).toBe(6);
    expect(form.last10.wins).toBe(4);
  });

  it("computes a positive trend for improving scoring margins", () => {
    const games = [game(0, 20), game(10, 20), game(20, 15), game(30, 10)];
    const form = computeRecentForm(games);
    expect(form.scoringTrend).toBeGreaterThan(0);
  });

  it("computes zero volatility for constant margins", () => {
    const games = [game(10, 0), game(20, 10), game(30, 20)];
    const form = computeRecentForm(games);
    expect(form.volatility).toBeCloseTo(0);
  });

  it("computes nonzero volatility for varying margins", () => {
    const games = [game(30, 0), game(0, 30), game(15, 15)];
    const form = computeRecentForm(games);
    expect(form.volatility).toBeGreaterThan(0);
  });
});
