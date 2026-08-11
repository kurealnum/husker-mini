import { describe, expect, it } from "vitest";

import {
  classifySeverity,
  computeInjuredPlayers,
  hasStarterAvailabilityRisk,
  inferStarterIds,
  totalEstimatedLostProduction,
} from "@/lib/analytics/player-availability";
import type { EspnInjury, EspnRosterResponse } from "@/lib/espn";
import type { PlayerGamelog } from "@/lib/analytics/player-strength";

describe("classifySeverity", () => {
  it.each([
    ["Out", "out"],
    ["Injured Reserve", "out"],
    ["Doubtful", "doubtful"],
    ["Questionable", "questionable"],
    ["Probable", "probable"],
    ["Day-To-Day", "unknown"],
  ] as const)("classifies %s as %s", (status, expected) => {
    expect(classifySeverity(status)).toBe(expected);
  });
});

describe("inferStarterIds", () => {
  it("treats the first athlete in each position group as the starter", () => {
    const roster: EspnRosterResponse = {
      team: { id: "t1", displayName: "T", abbreviation: "T", location: "T", name: "T" },
      athletes: [
        {
          position: "QB",
          items: [
            { id: "qb1", fullName: "Starter QB", displayName: "Starter QB" },
            { id: "qb2", fullName: "Backup QB", displayName: "Backup QB" },
          ],
        },
      ],
    };
    expect(inferStarterIds(roster)).toEqual(new Set(["qb1"]));
  });
});

describe("computeInjuredPlayers", () => {
  const injuries: EspnInjury[] = [
    { status: "Out", athlete: { id: "qb1", displayName: "Starter QB" } },
    { status: "Questionable", athlete: { id: "wr2", displayName: "Backup WR" } },
  ];
  const gamelogs: PlayerGamelog[] = [
    {
      athlete: { id: "qb1", fullName: "Starter QB", displayName: "Starter QB" },
      entries: [
        { gameId: "1", date: "d", stats: { points: 20 } },
        { gameId: "2", date: "d", stats: { points: 24 } },
      ],
    },
  ];

  it("builds injured player entries with severity, starter flag, and lost production", () => {
    const starterIds = new Set(["qb1"]);
    const result = computeInjuredPlayers(injuries, starterIds, gamelogs, "points");

    expect(result).toHaveLength(2);
    const qb = result.find((p) => p.athleteId === "qb1")!;
    expect(qb.severity).toBe("out");
    expect(qb.isStarter).toBe(true);
    expect(qb.estimatedLostProduction).toBeCloseTo(22 * 1);

    const wr = result.find((p) => p.athleteId === "wr2")!;
    expect(wr.isStarter).toBe(false);
    expect(wr.estimatedLostProduction).toBe(0);
  });

  it("sums lost production across all injured players", () => {
    const result = computeInjuredPlayers(injuries, new Set(["qb1"]), gamelogs, "points");
    expect(totalEstimatedLostProduction(result)).toBeCloseTo(22);
  });

  it("flags starter availability risk when a starter is injured", () => {
    const result = computeInjuredPlayers(injuries, new Set(["qb1"]), gamelogs, "points");
    expect(hasStarterAvailabilityRisk(result)).toBe(true);
    expect(hasStarterAvailabilityRisk([])).toBe(false);
  });
});
