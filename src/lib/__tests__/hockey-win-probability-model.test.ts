import { describe, expect, it } from "vitest";

import { computeHockeyWinProbability, HOCKEY_MODEL_SPEC } from "../hockey-win-probability-model";

describe("computeHockeyWinProbability", () => {
  it("uses the fitted intercept when both teams are even", () => {
    const probability = computeHockeyWinProbability({ eloDiff: 0, playerRatingDiff: 0 });
    expect(probability).toBeCloseTo(1 / (1 + Math.exp(-HOCKEY_MODEL_SPEC.intercept)), 5);
  });

  it("favors the home team as its scoring-differential advantage grows", () => {
    const even = computeHockeyWinProbability({ eloDiff: 0, playerRatingDiff: 0 });
    const favored = computeHockeyWinProbability({ eloDiff: 2, playerRatingDiff: 0 });
    expect(favored).toBeGreaterThan(even);
  });

  it("clips to [0, 1] for extreme inputs", () => {
    expect(computeHockeyWinProbability({ eloDiff: 1000, playerRatingDiff: 0 })).toBeLessThanOrEqual(1);
    expect(computeHockeyWinProbability({ eloDiff: -1000, playerRatingDiff: 0 })).toBeGreaterThanOrEqual(0);
  });

  it("ignores playerRatingDiff, since it ships zero-weighted for now", () => {
    const withoutPlayerRating = computeHockeyWinProbability({ eloDiff: 1, playerRatingDiff: 0 });
    const withPlayerRating = computeHockeyWinProbability({ eloDiff: 1, playerRatingDiff: 500 });
    expect(withPlayerRating).toBeCloseTo(withoutPlayerRating, 10);
  });
});
