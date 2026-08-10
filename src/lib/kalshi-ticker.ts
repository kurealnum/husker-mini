/** Kalshi event tickers are uppercase alphanumeric with dashes, e.g. KXNFLGAME-25AUG09DEN. */
const KALSHI_TICKER_PATTERN = /^[A-Z0-9-]{3,64}$/;

export function isValidKalshiTicker(ticker: string): boolean {
  return KALSHI_TICKER_PATTERN.test(ticker);
}
