import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import type { KalshiMarket } from "@/lib/kalshi/client";
import { fetchTeamDirectory, type SportsTeamInfo } from "@/lib/sports/team-directory";
import { predictionStages } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

export class AmbiguousTeamResolutionError extends Error {}

export interface ResolvedTeams {
  team1: string;
  team2: string;
}

/** The per-team suffix Kalshi appends to a market's ticker, e.g. "MIL" in "…-MIL". */
function tickerSuffix(marketTicker: string): string {
  return marketTicker.slice(marketTicker.lastIndexOf("-") + 1);
}

function findTeam(market: KalshiMarket, teams: SportsTeamInfo[]): SportsTeamInfo | undefined {
  const suffix = tickerSuffix(market.ticker);
  return teams.find(
    (team) =>
      team.abbreviation.toUpperCase() === suffix.toUpperCase() ||
      team.location.toLowerCase() === (market.yes_sub_title ?? "").toLowerCase(),
  );
}

/**
 * Matches each of a Kalshi event's two per-team markets against the sports
 * provider's team directory, using the market's own ticker suffix (Kalshi's
 * team abbreviation, e.g. "-MIL") and `yes_sub_title` (the team's city name)
 * rather than fuzzy-parsing the free-text event title. Anything other than
 * exactly two distinct, resolved teams fails the prediction rather than
 * guessing.
 */
export async function resolveTeamsStage(
  predictionId: string,
  sport: string,
  markets: KalshiMarket[],
  sportsApiBaseUrl: string,
): Promise<ResolvedTeams> {
  const stageId = await startStage(predictionId, "resolve_teams");

  try {
    const directory = await fetchTeamDirectory(sport, sportsApiBaseUrl);
    const matches = markets.map((market) => findTeam(market, directory)).filter((team) => team != null);

    // Multiple markets can resolve to the same team (shouldn't happen, but
    // dedupe by display name before judging ambiguity rather than guessing).
    const distinct = [...new Map(matches.map((m) => [m.displayName, m])).values()];

    if (distinct.length !== 2) {
      const tickers = markets.map((m) => m.ticker).join(", ");
      throw new AmbiguousTeamResolutionError(
        `Expected exactly 2 teams across markets [${tickers}], resolved ${distinct.length}: ` +
          distinct.map((t) => t.displayName).join(", "),
      );
    }

    const resolved: ResolvedTeams = { team1: distinct[0].displayName, team2: distinct[1].displayName };

    await completeStage(stageId, "Teams resolved.", { ...resolved });
    return resolved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await failStage(stageId, message);
    throw error;
  }
}

// Re-exported so callers can inspect the persisted mapping without redoing resolution.
export async function getStoredTeamMapping(predictionId: string): Promise<ResolvedTeams | null> {
  const [stage] = await db
    .select()
    .from(predictionStages)
    .where(and(eq(predictionStages.predictionId, predictionId), eq(predictionStages.stage, "resolve_teams")))
    .orderBy(predictionStages.createdAt)
    .limit(1);

  if (!stage || !stage.metadata) return null;
  const metadata = stage.metadata as Record<string, unknown>;
  if (typeof metadata.team1 !== "string" || typeof metadata.team2 !== "string") return null;
  return { team1: metadata.team1, team2: metadata.team2 };
}
