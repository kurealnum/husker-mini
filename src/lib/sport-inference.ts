export class UnsupportedSportError extends Error {}

/** Maps a Kalshi event category to our internal sport key. */
const CATEGORY_TO_SPORT: Record<string, string> = {
  Football: "nfl",
  "College Football": "ncaaf",
  Basketball: "nba",
  "College Basketball": "ncaab",
  Hockey: "nhl",
  Baseball: "mlb",
};

export function inferSportFromCategory(category: string | undefined): string {
  const sport = category ? CATEGORY_TO_SPORT[category] : undefined;
  if (!sport) {
    throw new UnsupportedSportError(`Unsupported or unrecognized Kalshi category: ${category}`);
  }
  return sport;
}
