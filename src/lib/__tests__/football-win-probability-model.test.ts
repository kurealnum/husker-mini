import { describe, expect, it } from "vitest";

import { computeFootballWinProbability, FOOTBALL_MODEL_SPEC } from "../football-win-probability-model";

describe("computeFootballWinProbability", () => {
  it("returns 0.5-ish probability when both teams are even", () => {
    const probability = computeFootballWinProbability({ eloDiff: 0, playerRatingDiff: 0 });
    expect(probability).toBeCloseTo(1 / (1 + Math.exp(-FOOTBALL_MODEL_SPEC.intercept)), 5);
  });

  it("favors the home team as its scoring-differential advantage grows", () => {
    const even = computeFootballWinProbability({ eloDiff: 0, playerRatingDiff: 0 });
    const favored = computeFootballWinProbability({ eloDiff: 10, playerRatingDiff: 0 });
    expect(favored).toBeGreaterThan(even);
  });

  it("clips to [0, 1] for extreme inputs", () => {
    expect(computeFootballWinProbability({ eloDiff: 1000, playerRatingDiff: 0 })).toBeLessThanOrEqual(1);
    expect(computeFootballWinProbability({ eloDiff: -1000, playerRatingDiff: 0 })).toBeGreaterThanOrEqual(0);
  });

  it("ignores playerRatingDiff, since it ships zero-weighted for now", () => {
    const withoutPlayerRating = computeFootballWinProbability({ eloDiff: 3, playerRatingDiff: 0 });
    const withPlayerRating = computeFootballWinProbability({ eloDiff: 3, playerRatingDiff: 500 });
    expect(withPlayerRating).toBeCloseTo(withoutPlayerRating, 10);
  });
});
