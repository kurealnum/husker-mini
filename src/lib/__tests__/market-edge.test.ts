import { describe, expect, it } from "vitest";

import { calculateKalshiFee, calculateKalshiFeeCents, calculateMarketEdge } from "@/lib/market-edge";

describe("calculateKalshiFee", () => {
  it("is highest at a market price of 0.5", () => {
    expect(calculateKalshiFee(0.5)).toBeGreaterThan(calculateKalshiFee(0.1));
    expect(calculateKalshiFee(0.5)).toBeGreaterThan(calculateKalshiFee(0.9));
  });

  it("is zero at the boundary prices", () => {
    expect(calculateKalshiFee(0)).toBe(0);
    expect(calculateKalshiFee(1)).toBe(0);
  });
});

describe("calculateKalshiFeeCents", () => {
  it("scales with contract count instead of rounding up once per contract", () => {
    const perContractCents = Math.ceil(calculateKalshiFee(0.5) * 100);
    const wholeOrderCents = calculateKalshiFeeCents(0.5, 100);
    // Ceiling once over the whole order is <= ceiling 100 times independently.
    expect(wholeOrderCents).toBeLessThanOrEqual(perContractCents * 100);
    expect(wholeOrderCents).toBeGreaterThan(perContractCents);
  });
});

describe("calculateMarketEdge", () => {
  it("calculates raw edge as model probability minus market price", () => {
    const result = calculateMarketEdge(0.65, 0.5, 0.02);
    expect(result.rawEdge).toBeCloseTo(0.15);
  });

  it("decides buy_yes when the model is more bullish than the market past the threshold", () => {
    const result = calculateMarketEdge(0.8, 0.5, 0.02);
    expect(result.decision).toBe("buy_yes");
  });

  it("decides buy_no when the model is more bearish than the market past the threshold", () => {
    const result = calculateMarketEdge(0.2, 0.5, 0.02);
    expect(result.decision).toBe("buy_no");
  });

  it("decides no_bet when net edge does not clear the threshold", () => {
    const result = calculateMarketEdge(0.51, 0.5, 0.5);
    expect(result.decision).toBe("no_bet");
  });

  it("decides no_bet exactly at the threshold boundary", () => {
    const marketPrice = 0.5;
    const fee = calculateKalshiFee(marketPrice);
    const rawEdge = 0.1;
    const edgeThreshold = rawEdge - fee;
    const result = calculateMarketEdge(marketPrice + rawEdge, marketPrice, edgeThreshold);
    expect(result.decision).toBe("no_bet");
  });
});
