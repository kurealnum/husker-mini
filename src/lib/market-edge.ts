export type TradeDecision = "buy_yes" | "buy_no" | "no_bet";

export interface MarketEdgeResult {
  rawEdge: number;
  /** Kalshi taker fee for a single contract at the chosen side's ask, in dollars. */
  feePerContract: number;
  /** Kalshi taker fee for a single contract at the chosen side's ask, in cents. */
  feeCentsPerContract: number;
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
 * Kalshi's standard taker fee for a whole order, in cents. Rounds up once
 * over the full order (`price * (1 - price) * contracts`), not once per
 * contract, matching how Kalshi charges the fee on a fill.
 */
export function calculateKalshiFeeCents(marketPrice: number, contracts: number, category?: string | null): number {
  return Math.ceil(calculateKalshiFee(marketPrice, category) * contracts * 100);
}

interface SideEdge {
  decision: "buy_yes" | "buy_no";
  rawEdgeCents: number;
  feeCentsPerContract: number;
  netEdgeCents: number;
}

/**
 * Evaluates one side of the market on its own executable ask. A "yes" bet is
 * scored against the yes leg's own ask; a "no" bet is scored against the
 * opposite leg's own ask — never against `1 - yesAsk`, since that leg has its
 * own order book and its own spread.
 */
function evaluateSide(
  decision: "buy_yes" | "buy_no",
  sideProbability: number,
  askPrice: number,
  category?: string | null,
): SideEdge {
  const rawEdgeCents = Math.round(sideProbability * 100) - Math.round(askPrice * 100);
  const feeCentsPerContract = Math.ceil(calculateKalshiFee(askPrice, category) * 100);
  const netEdgeCents = rawEdgeCents - feeCentsPerContract;
  return { decision, rawEdgeCents, feeCentsPerContract, netEdgeCents };
}

/**
 * Calculates raw/net edge and the resulting trade decision, scoring each side
 * of the market against that side's own executable ask (never a complement
 * of the other side's price — the two legs have separate order books and
 * separate spreads).
 *
 * raw_edge = model-implied probability of that side - that side's ask
 * net_edge = raw_edge - fee
 * A side only qualifies as a candidate when its raw edge is positive (the
 * model favors it over the market) and its net edge clears the threshold.
 * When both sides qualify, the larger net edge wins. `noAskPrice` may be
 * null (no executable ask on that leg yet), in which case only the yes side
 * is considered.
 * All money math is done in integer cents to avoid float rounding drift.
 */
export function calculateMarketEdge(
  modelProbability: number,
  yesAskPrice: number,
  noAskPrice: number | null,
  edgeThreshold: number,
  category?: string | null,
): MarketEdgeResult {
  const edgeThresholdCents = Math.round(edgeThreshold * 100);

  const yesEdge = evaluateSide("buy_yes", modelProbability, yesAskPrice, category);
  const noEdge = noAskPrice != null ? evaluateSide("buy_no", 1 - modelProbability, noAskPrice, category) : null;

  const candidates = [yesEdge, noEdge].filter(
    (side): side is SideEdge => side != null && side.rawEdgeCents > 0 && side.netEdgeCents > edgeThresholdCents,
  );

  const chosen =
    candidates.length > 0
      ? candidates.reduce((best, side) => (side.netEdgeCents > best.netEdgeCents ? side : best))
      : null;

  // No qualifying side: report the yes leg's numbers (always available) with
  // a no_bet decision, so rawEdge/netEdge still reflect a real comparison.
  const reported = chosen ?? yesEdge;

  return {
    rawEdge: reported.rawEdgeCents / 100,
    feePerContract: reported.feeCentsPerContract / 100,
    feeCentsPerContract: reported.feeCentsPerContract,
    netEdge: reported.netEdgeCents / 100,
    decision: chosen?.decision ?? "no_bet",
  };
}
