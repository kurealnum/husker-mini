import type { MarketSide, Prediction } from "@/database/schemas";

/** Assumed contracts for a paper trade, which never records a real fill count. */
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
 * A winning contract pays out 100 cents; a losing one pays nothing. When a
 * real order was executed (`entryPriceCents`/`predictedContracts` set by the
 * `execute_order` stage), those real fill values are used. Otherwise — a
 * paper trade, or a live position sized to zero contracts — the entry price
 * falls back to the market price recorded at decision time (using the
 * complementary price for a `buy_no` decision) and assumes one contract.
 */
export function calculateSettlementOutcome(
  prediction: Pick<Prediction, "decision" | "predictedSide" | "marketPrice" | "feesCents"> &
    Partial<Pick<Prediction, "entryPriceCents" | "predictedContracts">>,
  settledResult: MarketSide,
): SettlementOutcome {
  if (!prediction.decision || prediction.decision === "no_bet" || !prediction.predictedSide) {
    return { winLoss: null, pnlCents: null, returnPercentage: null };
  }

  const contracts = prediction.predictedContracts ?? ASSUMED_CONTRACTS;
  if (contracts < 1) {
    return { winLoss: null, pnlCents: null, returnPercentage: null };
  }

  let entryPriceCents: number;
  if (prediction.entryPriceCents != null) {
    entryPriceCents = prediction.entryPriceCents;
  } else if (prediction.marketPrice != null) {
    const entryPrice = prediction.predictedSide === "yes" ? prediction.marketPrice : 1 - prediction.marketPrice;
    entryPriceCents = Math.round(entryPrice * 100);
  } else {
    return { winLoss: null, pnlCents: null, returnPercentage: null };
  }

  const feesCents = prediction.feesCents ?? 0;
  const won = prediction.predictedSide === settledResult;

  const pnlCents = won
    ? (100 - entryPriceCents) * contracts - feesCents
    : -(entryPriceCents * contracts) - feesCents;

  const costCents = entryPriceCents * contracts;
  const returnPercentage = costCents > 0 ? pnlCents / costCents : null;

  return { winLoss: won ? "win" : "loss", pnlCents, returnPercentage };
}
