import { describe, expect, it } from "vitest";

import { computeTennisTechnicalProbability } from "../tennis-technical-formula";
import { InvalidGameDataError } from "../technical-formula";

describe("computeTennisTechnicalProbability", () => {
  it("treats 0 sets each as a coin flip", () => {
    expect(computeTennisTechnicalProbability(1, 0.3, 0, 0)).toBe(0.5);
  });

  it("gives a 2-0 set lead a clearly different probability than a 1-0 lead", () => {
    const oneSet = computeTennisTechnicalProbability(1, 0.5, 1, 0);
    const twoSets = computeTennisTechnicalProbability(1, 0.5, 2, 0);
    expect(twoSets).toBeGreaterThan(oneSet);
  });

  it("makes the same set lead more decisive as the match progresses", () => {
    const early = computeTennisTechnicalProbability(1, 0.2, 1, 0);
    const late = computeTennisTechnicalProbability(1, 0.9, 1, 0);
    expect(late).toBeGreaterThan(early);
  });

  it("rejects non-finite or negative inputs", () => {
    expect(() => computeTennisTechnicalProbability(1, 0.5, -1, 0)).toThrow(InvalidGameDataError);
    expect(() => computeTennisTechnicalProbability(NaN, 0.5, 1, 0)).toThrow(InvalidGameDataError);
  });
});
