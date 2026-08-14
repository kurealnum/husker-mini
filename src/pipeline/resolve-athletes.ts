import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import type { KalshiMarket } from "@/lib/kalshi/client";
import { fetchAthleteDirectory, type AthleteInfo } from "@/lib/sports/athlete-directory";
import { predictionStages } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

export class AmbiguousAthleteResolutionError extends Error {}

export interface ResolvedAthletes {
  athlete1: string;
  athlete2: string;
}

/** The per-athlete suffix Kalshi appends to a market's ticker, e.g. "VAL" in "…-VAL". */
function tickerSuffix(marketTicker: string): string {
  return marketTicker.slice(marketTicker.lastIndexOf("-") + 1);
}

function findAthlete(market: KalshiMarket, athletes: AthleteInfo[]): AthleteInfo | undefined {
  const subTitle = (market.yes_sub_title ?? "").toLowerCase();
  const suffix = tickerSuffix(market.ticker).toLowerCase();
  return athletes.find(
    (athlete) =>
      athlete.displayName.toLowerCase() === subTitle ||
      athlete.lastName.toLowerCase().startsWith(suffix) ||
      suffix.startsWith(athlete.lastName.slice(0, 3).toLowerCase()),
  );
}

/**
 * Athlete-sport equivalent of `resolveTeamsStage`: matches each of a Kalshi
 * event's two per-player markets against the current top-ranked players
 * (`fetchAthleteDirectory`), using `yes_sub_title` (the player's full name)
 * first and falling back to a last-name-prefix match against the ticker
 * suffix (Kalshi abbreviates to ~3 letters, e.g. "VAL" for Vallejo).
 * Anything other than exactly two distinct, resolved athletes fails the
 * prediction rather than guessing — including a player ranked outside the
 * directory's top ~150, which is a real, expected limitation (see
 * `fetchAthleteDirectory`'s doc comment), not a bug to work around here.
 */
export async function resolveAthletesStage(
  predictionId: string,
  league: string,
  markets: KalshiMarket[],
  sportsApiBaseUrl: string,
): Promise<ResolvedAthletes> {
  const stageId = await startStage(predictionId, "resolve_athletes");

  try {
    const directory = await fetchAthleteDirectory(league, sportsApiBaseUrl);
    const matches = markets.map((market) => findAthlete(market, directory)).filter((a) => a != null);

    const distinct = [...new Map(matches.map((a) => [a.displayName, a])).values()];

    if (distinct.length !== 2) {
      const tickers = markets.map((m) => m.ticker).join(", ");
      throw new AmbiguousAthleteResolutionError(
        `Expected exactly 2 athletes across markets [${tickers}], resolved ${distinct.length}: ` +
          distinct.map((a) => a.displayName).join(", "),
      );
    }

    const resolved: ResolvedAthletes = { athlete1: distinct[0].displayName, athlete2: distinct[1].displayName };

    await completeStage(stageId, "Athletes resolved.", { ...resolved });
    return resolved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failStage(stageId, message);
    throw error;
  }
}

/** Re-exported so callers can inspect the persisted mapping without redoing resolution. */
export async function getStoredAthleteMapping(predictionId: string): Promise<ResolvedAthletes | null> {
  const [stage] = await db
    .select()
    .from(predictionStages)
    .where(and(eq(predictionStages.predictionId, predictionId), eq(predictionStages.stage, "resolve_athletes")))
    .orderBy(predictionStages.createdAt)
    .limit(1);

  if (!stage || !stage.metadata) return null;
  const metadata = stage.metadata as Record<string, unknown>;
  if (typeof metadata.athlete1 !== "string" || typeof metadata.athlete2 !== "string") return null;
  return { athlete1: metadata.athlete1, athlete2: metadata.athlete2 };
}
