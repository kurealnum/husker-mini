import { describe, expect, it } from "vitest";

import { computeGolfFieldWinProbabilities } from "../golf-win-probability-model";

describe("computeGolfFieldWinProbabilities", () => {
  it("always sums to 1 across the field", () => {
    const probs = computeGolfFieldWinProbabilities([
      { id: "a", scoreRelativeToPar: -8 },
      { id: "b", scoreRelativeToPar: -3 },
      { id: "c", scoreRelativeToPar: 2 },
      { id: "d", scoreRelativeToPar: 10 },
    ]);
    const total = [...probs.values()].reduce((sum, p) => sum + p, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("gives a lower stroke count a higher win probability", () => {
    const probs = computeGolfFieldWinProbabilities([
      { id: "leader", scoreRelativeToPar: -10 },
      { id: "chaser", scoreRelativeToPar: -2 },
    ]);
    expect(probs.get("leader")!).toBeGreaterThan(probs.get("chaser")!);
  });

  it("gives tied players at the top identical probability", () => {
    const probs = computeGolfFieldWinProbabilities([
      { id: "a", scoreRelativeToPar: -5 },
      { id: "b", scoreRelativeToPar: -5 },
      { id: "c", scoreRelativeToPar: 3 },
    ]);
    expect(probs.get("a")).toBeCloseTo(probs.get("b")!, 10);
  });

  it("returns an empty map for an empty field", () => {
    expect(computeGolfFieldWinProbabilities([]).size).toBe(0);
  });
});
