/**
 * Market/odds metrics for a game, built from the ESPN wrapper's odds
 * endpoint (`@/lib/espn`'s `getGameOdds`). ESPN's odds endpoint only ever
 * reflects the current line — capturing an opening line and line movement
 * requires the caller to poll `getGameOdds` periodically and pass the
 * resulting snapshots to `trackLineMovement`.
 */
import type { EspnOdds, EspnOddsResponse } from "@/lib/espn";

export interface MarketSnapshot {
  capturedAt: string;
  moneylineHome: number | null;
  moneylineAway: number | null;
  spread: number | null;
  total: number | null;
}

/**
 * Picks a single odds entry to use as the canonical market snapshot.
 * Prefers `preferredProviderId` when given (e.g. a specific sportsbook),
 * otherwise falls back to the first entry ESPN returns.
 */
function selectOdds(response: EspnOddsResponse, preferredProviderId?: string): EspnOdds | null {
  if (response.items.length === 0) return null;
  if (preferredProviderId) {
    const preferred = response.items.find((o) => o.provider.id === preferredProviderId);
    if (preferred) return preferred;
  }
  return response.items[0];
}

/** Extracts a normalized market snapshot from a raw odds response. */
export function extractMarketSnapshot(
  response: EspnOddsResponse,
  capturedAt: string,
  preferredProviderId?: string,
): MarketSnapshot | null {
  const odds = selectOdds(response, preferredProviderId);
  if (!odds) return null;

  return {
    capturedAt,
    moneylineHome: odds.homeTeamOdds?.moneyLine ?? null,
    moneylineAway: odds.awayTeamOdds?.moneyLine ?? null,
    spread: odds.spread ?? null,
    total: odds.overUnder ?? null,
  };
}

export interface LineMovement {
  opening: MarketSnapshot;
  current: MarketSnapshot;
  spreadMovement: number | null;
  totalMovement: number | null;
  moneylineHomeMovement: number | null;
}

/**
 * Compares the earliest and latest of a chronologically-ordered series of
 * market snapshots (as captured by repeated polling) to derive line
 * movement. Returns null if fewer than two snapshots are available.
 */
export function trackLineMovement(snapshots: MarketSnapshot[]): LineMovement | null {
  if (snapshots.length < 2) return null;

  const opening = snapshots[0];
  const current = snapshots[snapshots.length - 1];

  return {
    opening,
    current,
    spreadMovement: diff(current.spread, opening.spread),
    totalMovement: diff(current.total, opening.total),
    moneylineHomeMovement: diff(current.moneylineHome, opening.moneylineHome),
  };
}

function diff(current: number | null, opening: number | null): number | null {
  if (current === null || opening === null) return null;
  return current - opening;
}
