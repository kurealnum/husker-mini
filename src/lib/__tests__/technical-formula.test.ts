import { describe, expect, it } from "vitest";

import { computeTechnicalProbability, InvalidGameDataError } from "@/lib/technical-formula";

describe("computeTechnicalProbability", () => {
  it("returns a coin flip when both teams have zero score", () => {
    expect(computeTechnicalProbability(1, 0.5, 0, 0)).toBe(0.5);
  });

  it("handles S = 0 (game hasn't started) as a coin flip regardless of score", () => {
    expect(computeTechnicalProbability(2, 0, 10, 3)).toBe(0.5);
  });

  it("handles S > 1 (overtime) by extrapolating past full game progress", () => {
    const atFullTime = computeTechnicalProbability(1, 1, 10, 3);
    const inOvertime = computeTechnicalProbability(1, 1.25, 10, 3);
    expect(inOvertime).toBeGreaterThan(atFullTime);
  });

  it("favors the leading team as the score differential grows", () => {
    const smallLead = computeTechnicalProbability(1, 0.5, 11, 10);
    const bigLead = computeTechnicalProbability(1, 0.5, 20, 1);
    expect(bigLead).toBeGreaterThan(smallLead);
    expect(bigLead).toBeGreaterThan(0.5);
  });

  it("throws for non-finite inputs", () => {
    expect(() => computeTechnicalProbability(NaN, 0.5, 1, 0)).toThrow(InvalidGameDataError);
  });

  it("throws for negative scores", () => {
    expect(() => computeTechnicalProbability(1, 0.5, -1, 0)).toThrow(InvalidGameDataError);
  });
});
