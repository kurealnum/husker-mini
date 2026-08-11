import { describe, expect, it } from "vitest";

import { calculatePositionSize, kellyFraction } from "@/lib/kelly";

describe("kellyFraction", () => {
  it("returns zero when there is no edge", () => {
    expect(kellyFraction(0.5, 0.6)).toBe(0);
  });

  it("returns a positive fraction when the model favors the bet", () => {
    // p=0.7, price=0.5 -> b=1, f* = 0.7 - 0.3/1 = 0.4
    expect(kellyFraction(0.7, 0.5)).toBeCloseTo(0.4);
  });

  it("clamps degenerate prices to zero", () => {
    expect(kellyFraction(0.7, 0)).toBe(0);
    expect(kellyFraction(0.7, 1)).toBe(0);
  });
});

describe("calculatePositionSize", () => {
  it("sizes a position proportional to fractional Kelly and bankroll", () => {
    // f*=0.4, 15% fraction -> stakeFraction=0.06, bankroll=$1000 -> $60 stake
    // price=50c -> 60/0.5 = 120 contracts
    const result = calculatePositionSize(0.7, 0.5, 100_000, 0.15, 1, 1000);
    expect(result.stakeFraction).toBeCloseTo(0.06);
    expect(result.contracts).toBe(119);
  });

  it("floors sized contracts below the minimum to zero", () => {
    const result = calculatePositionSize(0.51, 0.5, 100, 0.15, 5, 1000);
    expect(result.contracts).toBe(0);
  });

  it("clamps sized contracts to the maximum", () => {
    const result = calculatePositionSize(0.9, 0.1, 10_000_000, 0.15, 1, 50);
    expect(result.contracts).toBe(50);
  });

  it("returns zero contracts with no edge", () => {
    const result = calculatePositionSize(0.5, 0.6, 100_000, 0.15, 1, 1000);
    expect(result.contracts).toBe(0);
  });
});
