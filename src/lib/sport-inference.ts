import { resolveLeagueFromTicker, UnsupportedLeagueError } from "@/lib/leagues/registry";

/** @deprecated Use `UnsupportedLeagueError` from `@/lib/leagues/registry`. */
export const UnsupportedSportError = UnsupportedLeagueError;

/** Resolves a Kalshi ticker to its registered league key (e.g. "nfl"). */
export function inferSportFromTicker(ticker: string): string {
  return resolveLeagueFromTicker(ticker).key;
}
