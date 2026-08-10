import type { MarketSide, Prediction } from "@/database/schemas";

/** Assumed contracts per paper trade — no bankroll/position sizing exists yet. */
const ASSUMED_CONTRACTS = 1;

export interface SettlementOutcome {
  winLoss: Prediction["winLoss"];
  pnlCents: number | null;
  returnPercentage: number | null;
}

/**
 * Derives win/loss and P&L for a settled prediction. Only `buy_yes`/`buy_no`
 * decisions can win or lose money; `no_bet` (or a missing decision) never
 * traded, so there is nothing to settle financially.
 *
 * A winning contract pays out 100 cents; a losing one pays nothing. The
 * entry price is derived from the market price recorded at decision time
 * (there is no separate executed-order price, since no real order is
 * placed), using the complementary price for a `buy_no` decision.
 */
export function calculateSettlementOutcome(
  prediction: Pick<Prediction, "decision" | "predictedSide" | "marketPrice" | "feesCents">,
  settledResult: MarketSide,
): SettlementOutcome {
  if (!prediction.decision || prediction.decision === "no_bet" || !prediction.predictedSide) {
    return { winLoss: null, pnlCents: null, returnPercentage: null };
  }
  if (prediction.marketPrice == null) {
    return { winLoss: null, pnlCents: null, returnPercentage: null };
  }

  const entryPrice =
    prediction.predictedSide === "yes" ? prediction.marketPrice : 1 - prediction.marketPrice;
  const entryPriceCents = Math.round(entryPrice * 100);
  const feesCents = prediction.feesCents ?? 0;
  const won = prediction.predictedSide === settledResult;

  const pnlCents = won
    ? (100 - entryPriceCents) * ASSUMED_CONTRACTS - feesCents
    : -(entryPriceCents * ASSUMED_CONTRACTS) - feesCents;

  const costCents = entryPriceCents * ASSUMED_CONTRACTS;
  const returnPercentage = costCents > 0 ? pnlCents / costCents : null;

  return { winLoss: won ? "win" : "loss", pnlCents, returnPercentage };
}
