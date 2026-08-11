import { describe, expect, it } from "vitest";

import {
  aggregatePlayerStats,
  minutesDistribution,
  recentPlayerForm,
  topPlayerStats,
  type PlayerGamelog,
} from "@/lib/analytics/player-strength";
import type { EspnAthlete } from "@/lib/espn";

function athlete(id: string, fullName: string): EspnAthlete {
  return { id, fullName, displayName: fullName };
}

function log(id: string, name: string, entries: Array<Record<string, number>>): PlayerGamelog {
  return {
    athlete: athlete(id, name),
    entries: entries.map((stats, i) => ({ gameId: `g${i}`, date: "2026-01-01", stats })),
  };
}

const logs: PlayerGamelog[] = [
  log("1", "Alice", [{ points: 20, minutes: 30 }, { points: 24, minutes: 32 }]),
  log("2", "Bob", [{ points: 10, minutes: 20 }, { points: 8, minutes: 18 }]),
];

describe("aggregatePlayerStats", () => {
  it("sums and averages a stat across the whole roster", () => {
    const result = aggregatePlayerStats(logs, "points");
    expect(result.total).toBe(20 + 24 + 10 + 8);
    expect(result.average).toBeCloseTo((20 + 24 + 10 + 8) / 4);
  });

  it("returns zero for an empty roster", () => {
    expect(aggregatePlayerStats([], "points")).toEqual({ total: 0, average: 0 });
  });
});

describe("topPlayerStats", () => {
  it("ranks players by per-game average descending", () => {
    const top = topPlayerStats(logs, "points", 1);
    expect(top).toHaveLength(1);
    expect(top[0].athlete.fullName).toBe("Alice");
    expect(top[0].average).toBeCloseTo(22);
  });
});

describe("minutesDistribution", () => {
  it("computes each player's share of team minutes", () => {
    const dist = minutesDistribution(logs);
    const alice = dist.find((d) => d.athlete.fullName === "Alice")!;
    const bob = dist.find((d) => d.athlete.fullName === "Bob")!;
    expect(alice.share).toBeCloseTo(62 / 100);
    expect(bob.share).toBeCloseTo(38 / 100);
  });

  it("returns zero shares when there are no logged minutes", () => {
    const dist = minutesDistribution([log("3", "Cam", [{ points: 5 }])]);
    expect(dist[0].share).toBe(0);
  });
});

describe("recentPlayerForm", () => {
  it("averages only the trailing window per player", () => {
    const form = recentPlayerForm(logs, "points", 1);
    const alice = form.find((f) => f.athlete.fullName === "Alice")!;
    expect(alice.recentAverage).toBeCloseTo(24);
  });
});
