import { describe, expect, it } from "vitest";

import { computeHockeyTechnicalProbability } from "../hockey-technical-formula";
import { InvalidGameDataError } from "../technical-formula";

describe("computeHockeyTechnicalProbability", () => {
  it("treats a scoreless game as a coin flip", () => {
    expect(computeHockeyTechnicalProbability(1, 0.5, 0, 0)).toBe(0.5);
  });

  it("gives a 5-0 lead a clearly different probability than a 1-0 lead — the ratio formula's saturation bug", () => {
    const oneNil = computeHockeyTechnicalProbability(1, 0.5, 1, 0);
    const fiveNil = computeHockeyTechnicalProbability(1, 0.5, 5, 0);
    expect(fiveNil).toBeGreaterThan(oneNil);
  });

  it("makes the same goal difference more decisive as the game progresses (time-remaining term)", () => {
    const early = computeHockeyTechnicalProbability(1, 0.1, 1, 0);
    const late = computeHockeyTechnicalProbability(1, 0.9, 1, 0);
    expect(late).toBeGreaterThan(early);
  });

  it("favors the trailing team's complement symmetrically", () => {
    const leading = computeHockeyTechnicalProbability(1, 0.5, 2, 1);
    const trailing = computeHockeyTechnicalProbability(1, 0.5, 1, 2);
    expect(leading).toBeCloseTo(1 - trailing, 10);
  });

  it("rejects non-finite or negative inputs", () => {
    expect(() => computeHockeyTechnicalProbability(1, 0.5, -1, 0)).toThrow(InvalidGameDataError);
    expect(() => computeHockeyTechnicalProbability(NaN, 0.5, 1, 0)).toThrow(InvalidGameDataError);
  });
});
