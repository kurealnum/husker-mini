import { describe, expect, it } from "vitest";

import { computeMmaWinProbability } from "../mma-win-probability-model";

describe("computeMmaWinProbability", () => {
  it("favors the fighter with the better career win rate", () => {
    const even = computeMmaWinProbability({ winRateDiff: 0 });
    const favored = computeMmaWinProbability({ winRateDiff: 0.3 });
    expect(favored).toBeGreaterThan(even);
  });

  it("clips to [0, 1] for extreme inputs", () => {
    expect(computeMmaWinProbability({ winRateDiff: 100 })).toBeLessThanOrEqual(1);
    expect(computeMmaWinProbability({ winRateDiff: -100 })).toBeGreaterThanOrEqual(0);
  });
});
