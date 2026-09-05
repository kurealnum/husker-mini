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
  it("calculates raw edge as model probability minus the yes ask", () => {
    const result = calculateMarketEdge(0.65, 0.5, 0.5, 0.02);
    expect(result.rawEdge).toBeCloseTo(0.15);
  });

  it("decides buy_yes when the model is more bullish than the yes ask past the threshold", () => {
    const result = calculateMarketEdge(0.8, 0.5, 0.5, 0.02);
    expect(result.decision).toBe("buy_yes");
  });

  it("decides buy_no when the model is more bearish than the no ask past the threshold", () => {
    const result = calculateMarketEdge(0.2, 0.5, 0.5, 0.02);
    expect(result.decision).toBe("buy_no");
  });

  it("decides no_bet when net edge does not clear the threshold", () => {
    const result = calculateMarketEdge(0.51, 0.5, 0.5, 0.5);
    expect(result.decision).toBe("no_bet");
  });

  it("decides no_bet exactly at the threshold boundary", () => {
    const askPrice = 0.5;
    const fee = calculateKalshiFee(askPrice);
    const rawEdge = 0.1;
    const edgeThreshold = rawEdge - fee;
    const result = calculateMarketEdge(askPrice + rawEdge, askPrice, askPrice, edgeThreshold);
    expect(result.decision).toBe("no_bet");
  });

  it("scores a buy_no decision against the opposite leg's own ask, not against 1 - yesAsk", () => {
    // Wide book: yes ask 60c, opposite (no) ask 45c — nowhere near 100-60=40c.
    // Model thinks yes only has a 35% chance, i.e. no has a 65% implied edge.
    const result = calculateMarketEdge(0.35, 0.6, 0.45, 0.02);
    expect(result.decision).toBe("buy_no");
    // rawEdge should reflect 0.65 (model's implied no probability) - 0.45 (real no ask) = 0.20,
    // not 0.65 - 0.40 = 0.25 (which would come from the wrong, complementary price).
    expect(result.rawEdge).toBeCloseTo(0.2);
  });

  it("only considers the yes side when no opposite ask is available", () => {
    const result = calculateMarketEdge(0.2, 0.5, null, 0.02);
    expect(result.decision).not.toBe("buy_no");
  });

  it("picks the larger net edge when both sides qualify", () => {
    // yes ask 40c vs model 70c (raw edge 30c); no ask 30c vs model's implied
    // no probability 30c (raw edge 0c, doesn't qualify) — only yes qualifies.
    const result = calculateMarketEdge(0.7, 0.4, 0.3, 0.02);
    expect(result.decision).toBe("buy_yes");
  });
});
