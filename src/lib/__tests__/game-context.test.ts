import { describe, expect, it } from "vitest";

import {
  classifySeasonStage,
  homeAwayFlag,
  recentTeamTransactions,
  restDays,
} from "@/lib/analytics/game-context";
import type { CompletedGame } from "@/lib/analytics/team-strength";
import type { EspnTransaction } from "@/lib/espn";

function game(date: string): CompletedGame {
  return { opponentId: "x", isHome: true, teamScore: 10, opponentScore: 7, won: true, date };
}

describe("homeAwayFlag", () => {
  it("maps boolean to flag", () => {
    expect(homeAwayFlag(true)).toBe("home");
    expect(homeAwayFlag(false)).toBe("away");
  });
});

describe("restDays", () => {
  it("returns days since the most recent prior game", () => {
    const games = [game("2026-01-01"), game("2026-01-08")];
    expect(restDays(games, "2026-01-15")).toBe(7);
  });

  it("ignores games on or after the target date", () => {
    const games = [game("2026-01-01"), game("2026-02-01")];
    expect(restDays(games, "2026-01-15")).toBe(14);
  });

  it("returns null when there is no prior game", () => {
    expect(restDays([], "2026-01-15")).toBeNull();
    expect(restDays([game("2026-02-01")], "2026-01-15")).toBeNull();
  });
});

describe("classifySeasonStage", () => {
  const start = "2026-01-01";
  const end = "2026-04-01";

  it("classifies early/mid/late thirds of the regular season", () => {
    expect(classifySeasonStage("2026-01-05", start, end)).toBe("early");
    expect(classifySeasonStage("2026-02-15", start, end)).toBe("mid");
    expect(classifySeasonStage("2026-03-25", start, end)).toBe("late");
  });

  it("classifies as playoffs once past the playoff start date", () => {
    expect(classifySeasonStage("2026-04-10", start, end, "2026-04-05")).toBe("playoffs");
  });
});

describe("recentTeamTransactions", () => {
  const transactions: EspnTransaction[] = [
    { date: "2026-01-10", description: "Signed WR", team: { id: "t1" } },
    { date: "2026-01-01", description: "Waived LB", team: { id: "t1" } },
    { date: "2026-01-12", description: "Traded RB", team: { id: "t2" } },
  ];

  it("filters to the team and window before the game date", () => {
    const result = recentTeamTransactions(transactions, "t1", "2026-01-15", 10);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Signed WR");
  });
});
