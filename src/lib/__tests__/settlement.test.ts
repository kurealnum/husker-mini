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
});
