export type TradeDecision = "buy_yes" | "buy_no" | "no_bet";

export interface MarketEdgeResult {
  rawEdge: number;
  fee: number;
  feeCents: number;
  netEdge: number;
  decision: TradeDecision;
}

/** Kalshi's standard taker fee, in probability units of a $1 contract. */
export function calculateKalshiFee(marketPrice: number, feeRate = 0.07): number {
  return feeRate * marketPrice * (1 - marketPrice);
}

/**
 * Calculates raw/net edge and the resulting trade decision.
 * raw_edge = model_probability - market_price
 * net_edge = abs(raw_edge) - fee
 * Below the configured edge threshold, no trade is placed.
 */
export function calculateMarketEdge(
  modelProbability: number,
  marketPrice: number,
  edgeThreshold: number,
): MarketEdgeResult {
  const rawEdge = modelProbability - marketPrice;
  const fee = calculateKalshiFee(marketPrice);
  const feeCents = Math.ceil(fee * 100);
  const netEdge = Math.abs(rawEdge) - fee;

  const decision: TradeDecision =
    netEdge <= edgeThreshold ? "no_bet" : rawEdge > 0 ? "buy_yes" : "buy_no";

  return { rawEdge, fee, feeCents, netEdge, decision };
}
