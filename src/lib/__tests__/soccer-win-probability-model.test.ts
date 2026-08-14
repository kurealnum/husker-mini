import { describe, expect, it } from "vitest";

import { computeSoccerWinProbabilities } from "../soccer-win-probability-model";

describe("computeSoccerWinProbabilities", () => {
  it("always sums to 1", () => {
    for (const eloDiff of [-10, -1, 0, 0.5, 3, 10]) {
      const p = computeSoccerWinProbabilities(eloDiff);
      expect(p.homeWinProbability + p.awayWinProbability + p.drawProbability).toBeCloseTo(1, 10);
    }
  });

  it("favors the home team as its scoring-differential advantage grows", () => {
    const even = computeSoccerWinProbabilities(0);
    const favored = computeSoccerWinProbabilities(2);
    expect(favored.homeWinProbability).toBeGreaterThan(even.homeWinProbability);
  });

  it("keeps every probability within [0, 1]", () => {
    const extreme = computeSoccerWinProbabilities(1000);
    expect(extreme.homeWinProbability).toBeLessThanOrEqual(1);
    expect(extreme.homeWinProbability).toBeGreaterThanOrEqual(0);
    expect(extreme.drawProbability).toBeGreaterThanOrEqual(0);
  });
});
