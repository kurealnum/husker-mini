/**
 * Fractional Kelly position sizing for a binary Kalshi contract.
 *
 * A contract costing `price` (0-1 probability terms, i.e. cents/100) pays
 * $1 if it resolves in the bettor's favor and $0 otherwise. For a bet on
 * probability `winProbability` of that outcome, the Kelly fraction of
 * bankroll to stake is:
 *
 *   f* = winProbability - (1 - winProbability) * price / (1 - price)
 *
 * This is the classic Kelly formula `f* = p - q/b` with net odds
 * `b = (1 - price) / price`. Negative or non-positive results mean there is
 * no edge (or a mispriced bet against the bettor) and staking should be zero.
 */
export function kellyFraction(winProbability: number, price: number): number {
  if (price <= 0 || price >= 1) {
    return 0;
  }
  const fraction = winProbability - (1 - winProbability) * (price / (1 - price));
  return Math.max(0, fraction);
}

export interface PositionSizeResult {
  /** Fraction of bankroll the fractional-Kelly formula recommends staking. */
  stakeFraction: number;
  /** Dollar (cent) amount of bankroll to stake, before contract rounding. */
  stakeCents: number;
  /** Number of contracts to buy, floored and clamped to [minContracts, maxContracts]. */
  contracts: number;
}

/**
 * Sizes a position using fractional Kelly, clamped to a sane contract range.
 * `price` and `winProbability` are both in probability terms (0-1); the
 * price of a `buy_no` decision must already be the complementary price
 * (1 - marketPrice) and `winProbability` the complementary model probability
 * before calling this.
 */
export function calculatePositionSize(
  winProbability: number,
  price: number,
  bankrollCents: number,
  kellyFractionMultiplier: number,
  minContracts: number,
  maxContracts: number,
): PositionSizeResult {
  const stakeFraction = kellyFractionMultiplier * kellyFraction(winProbability, price);
  const stakeCents = stakeFraction * bankrollCents;
  const priceCents = price * 100;
  const rawContracts = priceCents > 0 ? Math.floor(stakeCents / priceCents) : 0;
  const contracts = rawContracts < minContracts ? 0 : Math.min(rawContracts, maxContracts);

  return { stakeFraction, stakeCents, contracts };
}
