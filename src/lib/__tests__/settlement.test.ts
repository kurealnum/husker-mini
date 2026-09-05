import { describe, expect, it } from "vitest";

import { calculateSettlementOutcome } from "@/lib/settlement";

describe("calculateSettlementOutcome", () => {
  it("returns no outcome for a no_bet decision", () => {
    const result = calculateSettlementOutcome(
      { decision: "no_bet", predictedSide: null, marketPrice: 0.6, feesCents: 0 },
      "yes",
    );
    expect(result).toEqual({ winLoss: null, pnlCents: null, returnPercentage: null });
  });

  it("returns no outcome when there is no recorded market price", () => {
    const result = calculateSettlementOutcome(
      { decision: "buy_yes", predictedSide: "yes", marketPrice: null, feesCents: 1 },
      "yes",
    );
    expect(result).toEqual({ winLoss: null, pnlCents: null, returnPercentage: null });
  });

  it("computes a win for buy_yes when the market settles yes", () => {
    const result = calculateSettlementOutcome(
      { decision: "buy_yes", predictedSide: "yes", marketPrice: 0.6, feesCents: 3 },
      "yes",
    );
    // Entry price 60c, payout 100c, fee 3c: pnl = (100 - 60) - 3 = 37
    expect(result.winLoss).toBe("win");
    expect(result.pnlCents).toBe(37);
    expect(result.returnPercentage).toBeCloseTo(37 / 60);
  });

  it("computes a loss for buy_yes when the market settles no", () => {
    const result = calculateSettlementOutcome(
      { decision: "buy_yes", predictedSide: "yes", marketPrice: 0.6, feesCents: 3 },
      "no",
    );
    // Entry price 60c lost entirely, plus the 3c fee: pnl = -(60) - 3 = -63
    expect(result.winLoss).toBe("loss");
    expect(result.pnlCents).toBe(-63);
    expect(result.returnPercentage).toBeCloseTo(-63 / 60);
  });

  it("uses the complementary price for a buy_no decision", () => {
    const result = calculateSettlementOutcome(
      { decision: "buy_no", predictedSide: "no", marketPrice: 0.6, feesCents: 2 },
      "no",
    );
    // Entry price = 1 - 0.6 = 0.40 -> 40c; pnl = (100 - 40) - 2 = 58
    expect(result.winLoss).toBe("win");
    expect(result.pnlCents).toBe(58);
  });

  it("uses the real fill price and contract count when a live order executed", () => {
    const result = calculateSettlementOutcome(
      {
        decision: "buy_yes",
        predictedSide: "yes",
        marketPrice: 0.6,
        feesCents: 6,
        entryPriceCents: 55,
        predictedContracts: 4,
      },
      "yes",
    );
    // Entry price 55c x4 contracts, payout 100c x4, fee 6c: pnl = (100-55)*4 - 6 = 174
    expect(result.winLoss).toBe("win");
    expect(result.pnlCents).toBe(174);
    expect(result.returnPercentage).toBeCloseTo(174 / (55 * 4));
  });

  it("computes a multi-contract win with a whole-order fee, not a per-contract one", () => {
    const result = calculateSettlementOutcome(
      {
        decision: "buy_yes",
        predictedSide: "yes",
        marketPrice: 0.5,
        feesCents: 350,
        entryPriceCents: 50,
        predictedContracts: 100,
      },
      "yes",
    );
    // Entry 50c x100, payout 100c x100, fee 350c (not 2c): pnl = (100-50)*100 - 350 = 4650
    expect(result.winLoss).toBe("win");
    expect(result.pnlCents).toBe(4650);
    expect(result.returnPercentage).toBeCloseTo(4650 / (50 * 100));
  });

  it("computes a multi-contract loss with a whole-order fee, not a per-contract one", () => {
    const result = calculateSettlementOutcome(
      {
        decision: "buy_yes",
        predictedSide: "yes",
        marketPrice: 0.5,
        feesCents: 350,
        entryPriceCents: 50,
        predictedContracts: 100,
      },
      "no",
    );
    // Entry 50c x100 lost entirely, plus the 350c fee: pnl = -(50*100) - 350 = -5350
    expect(result.winLoss).toBe("loss");
    expect(result.pnlCents).toBe(-5350);
    expect(result.returnPercentage).toBeCloseTo(-5350 / (50 * 100));
  });

  it("treats a zero-contract live position as unsettled financially", () => {
    const result = calculateSettlementOutcome(
      { decision: "buy_yes", predictedSide: "yes", marketPrice: 0.6, feesCents: 0, predictedContracts: 0 },
      "yes",
    );
    expect(result).toEqual({ winLoss: null, pnlCents: null, returnPercentage: null });
  });
});
