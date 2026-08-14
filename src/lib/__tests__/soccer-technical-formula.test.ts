import { describe, expect, it } from "vitest";

import { computeSoccerTechnicalProbabilities } from "../soccer-technical-formula";
import { InvalidGameDataError } from "../technical-formula";

function sum(p: { homeWinProbability: number; awayWinProbability: number; drawProbability: number }): number {
  return p.homeWinProbability + p.awayWinProbability + p.drawProbability;
}

describe("computeSoccerTechnicalProbabilities", () => {
  it("always sums to 1", () => {
    expect(sum(computeSoccerTechnicalProbabilities(1, 0.5, 0, 0))).toBeCloseTo(1, 10);
    expect(sum(computeSoccerTechnicalProbabilities(1, 0.9, 2, 0))).toBeCloseTo(1, 10);
    expect(sum(computeSoccerTechnicalProbabilities(1, 0.1, 0, 1))).toBeCloseTo(1, 10);
  });

  it("splits evenly three ways at 0-0", () => {
    const p = computeSoccerTechnicalProbabilities(1, 0.5, 0, 0);
    expect(p.homeWinProbability).toBeCloseTo(1 / 3, 10);
    expect(p.awayWinProbability).toBeCloseTo(1 / 3, 10);
    expect(p.drawProbability).toBeCloseTo(1 / 3, 10);
  });

  it("favors the leading team as the goal difference grows, without ratio saturation", () => {
    const oneNil = computeSoccerTechnicalProbabilities(1, 0.5, 1, 0);
    const threeNil = computeSoccerTechnicalProbabilities(1, 0.5, 3, 0);
    expect(threeNil.homeWinProbability).toBeGreaterThan(oneNil.homeWinProbability);
  });

  it("makes the same goal difference more decisive as the game progresses", () => {
    const early = computeSoccerTechnicalProbabilities(1, 0.1, 1, 0);
    const late = computeSoccerTechnicalProbabilities(1, 0.95, 1, 0);
    expect(late.homeWinProbability).toBeGreaterThan(early.homeWinProbability);
    expect(late.drawProbability).toBeLessThan(early.drawProbability);
  });

  it("rejects non-finite or negative inputs", () => {
    expect(() => computeSoccerTechnicalProbabilities(1, 0.5, -1, 0)).toThrow(InvalidGameDataError);
    expect(() => computeSoccerTechnicalProbabilities(NaN, 0.5, 1, 0)).toThrow(InvalidGameDataError);
  });
});
