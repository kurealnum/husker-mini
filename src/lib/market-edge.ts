export type TradeDecision = "buy_yes" | "buy_no" | "no_bet";

export interface MarketEdgeResult {
  rawEdge: number;
  fee: number;
  feeCents: number;
  netEdge: number;
  decision: TradeDecision;
}

/** Default Kalshi taker fee coefficient, in ten-thousandths (700 = 0.07). */
const DEFAULT_FEE_TAKER_COEFF_TEN_THOUSANDTHS = 700;

/**
 * Reads the Kalshi taker fee coefficient for a category, in ten-thousandths.
 * Checks `KALSHI_FEE_TAKER_COEFF_<CATEGORY>` first, then falls back to the
 * category-less `KALSHI_FEE_TAKER_COEFF`, then the hardcoded default (700 = 0.07).
 */
export function readFeeTakerCoeffTenThousandths(category?: string | null): number {
  const perCategory = category ? process.env[`KALSHI_FEE_TAKER_COEFF_${category.toUpperCase()}`] : undefined;
  const raw = perCategory ?? process.env.KALSHI_FEE_TAKER_COEFF;
  if (raw == null || raw === "") {
    return DEFAULT_FEE_TAKER_COEFF_TEN_THOUSANDTHS;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : DEFAULT_FEE_TAKER_COEFF_TEN_THOUSANDTHS;
}

/** Kalshi's standard taker fee, in probability units of a $1 contract. */
export function calculateKalshiFee(marketPrice: number, category?: string | null): number {
  const coeff = readFeeTakerCoeffTenThousandths(category) / 10000;
  return coeff * marketPrice * (1 - marketPrice);
}

/**
 * Calculates raw/net edge and the resulting trade decision.
 * raw_edge = model_probability - market_price
 * net_edge = abs(raw_edge) - fee
 * Below the configured edge threshold, no trade is placed.
 * All money math is done in integer cents to avoid float rounding drift.
 */
export function calculateMarketEdge(
  modelProbability: number,
  marketPrice: number,
  edgeThreshold: number,
  category?: string | null,
): MarketEdgeResult {
  const rawEdgeCents = Math.round(modelProbability * 100) - Math.round(marketPrice * 100);
  const rawEdge = rawEdgeCents / 100;
  const feeCents = Math.ceil(calculateKalshiFee(marketPrice, category) * 100);
  const netEdgeCents = Math.abs(rawEdgeCents) - feeCents;
  const netEdge = netEdgeCents / 100;
  const edgeThresholdCents = Math.round(edgeThreshold * 100);

  const decision: TradeDecision =
    rawEdgeCents === 0 || netEdgeCents <= edgeThresholdCents
      ? "no_bet"
      : rawEdgeCents > 0
        ? "buy_yes"
        : "buy_no";

  return { rawEdge, fee: feeCents / 100, feeCents, netEdge, decision };
}
