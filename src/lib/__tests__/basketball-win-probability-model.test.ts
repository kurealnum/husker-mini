import { describe, expect, it } from "vitest";

import {
  computeBasketballWinProbability,
  getBasketballModelSpec,
  NBA_MODEL_SPEC,
  NCAAB_MODEL_SPEC,
} from "../basketball-win-probability-model";

describe("getBasketballModelSpec", () => {
  it("returns the NBA spec for nba", () => {
    expect(getBasketballModelSpec("nba")).toBe(NBA_MODEL_SPEC);
  });

  it("returns the NCAAB spec for ncaab", () => {
    expect(getBasketballModelSpec("ncaab")).toBe(NCAAB_MODEL_SPEC);
  });

  it("throws for an unrelated league", () => {
    expect(() => getBasketballModelSpec("nfl")).toThrow();
  });
});

describe("computeBasketballWinProbability", () => {
  it("uses each league's own intercept when both teams are even", () => {
    const nba = computeBasketballWinProbability(NBA_MODEL_SPEC, { eloDiff: 0, playerRatingDiff: 0 });
    const ncaab = computeBasketballWinProbability(NCAAB_MODEL_SPEC, { eloDiff: 0, playerRatingDiff: 0 });
    expect(nba).toBeCloseTo(1 / (1 + Math.exp(-NBA_MODEL_SPEC.intercept)), 5);
    expect(ncaab).toBeCloseTo(1 / (1 + Math.exp(-NCAAB_MODEL_SPEC.intercept)), 5);
    expect(nba).not.toBeCloseTo(ncaab, 3);
  });

  it("favors the home team as its scoring-differential advantage grows", () => {
    const even = computeBasketballWinProbability(NBA_MODEL_SPEC, { eloDiff: 0, playerRatingDiff: 0 });
    const favored = computeBasketballWinProbability(NBA_MODEL_SPEC, { eloDiff: 10, playerRatingDiff: 0 });
    expect(favored).toBeGreaterThan(even);
  });

  it("clips to [0, 1] for extreme inputs", () => {
    expect(computeBasketballWinProbability(NCAAB_MODEL_SPEC, { eloDiff: 1000, playerRatingDiff: 0 })).toBeLessThanOrEqual(1);
    expect(computeBasketballWinProbability(NCAAB_MODEL_SPEC, { eloDiff: -1000, playerRatingDiff: 0 })).toBeGreaterThanOrEqual(0);
  });
});
