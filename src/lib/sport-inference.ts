export class UnsupportedSportError extends Error {}

/**
 * Maps a Kalshi ticker series prefix to our internal sport key. Kalshi's
 * event `category` field is a generic "Sports" for every sport, so the
 * actual sport has to come from the ticker itself instead.
 */
const SERIES_PREFIX_TO_SPORT: Record<string, string> = {
  KXNFLGAME: "nfl",
  KXNCAAFGAME: "ncaaf",
  KXNBAGAME: "nba",
  KXNCAABGAME: "ncaab",
  KXNHLGAME: "nhl",
  KXMLBGAME: "mlb",
};

export function inferSportFromTicker(ticker: string): string {
  const seriesPrefix = ticker.split("-")[0];
  const sport = seriesPrefix ? SERIES_PREFIX_TO_SPORT[seriesPrefix] : undefined;
  if (!sport) {
    throw new UnsupportedSportError(`Unsupported or unrecognized Kalshi ticker series: ${seriesPrefix}`);
  }
  return sport;
}
