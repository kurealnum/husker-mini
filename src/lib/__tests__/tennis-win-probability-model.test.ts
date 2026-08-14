import { describe, expect, it } from "vitest";

import { computeTennisWinProbability } from "../tennis-win-probability-model";

describe("computeTennisWinProbability", () => {
  it("favors the better-ranked player as the ranking gap grows", () => {
    const even = computeTennisWinProbability({ rankDiff: 0, recentFormDiff: 0 });
    const favored = computeTennisWinProbability({ rankDiff: 50, recentFormDiff: 0 });
    expect(favored).toBeGreaterThan(even);
  });

  it("clips to [0, 1] for extreme inputs", () => {
    expect(computeTennisWinProbability({ rankDiff: 10000, recentFormDiff: 0 })).toBeLessThanOrEqual(1);
    expect(computeTennisWinProbability({ rankDiff: -10000, recentFormDiff: 0 })).toBeGreaterThanOrEqual(0);
  });

  it("ignores recentFormDiff, since it ships zero-weighted for now", () => {
    const without = computeTennisWinProbability({ rankDiff: 10, recentFormDiff: 0 });
    const withForm = computeTennisWinProbability({ rankDiff: 10, recentFormDiff: 500 });
    expect(withForm).toBeCloseTo(without, 10);
  });
});
