import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { fetchAthleteDirectory } from "@/lib/sports/athlete-directory";
import type { SportsGame } from "@/lib/sports/provider";
import { computeTennisWinProbability, TENNIS_MODEL_VERSION } from "@/lib/tennis-win-probability-model";
import { technicalAnalyses } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

export interface TennisFeatures {
  espnWinProbability: number;
  espnModelVersion: string;
  rawEspnData: Record<string, unknown>;
}

/**
 * Athlete-sport equivalent of `assembleFeaturesStage`, deliberately thin:
 * tennis has no team, no roster, and no injury endpoint to build a full
 * team-strength/availability feature set from (issue #165 acceptance
 * criterion: no part of this pipeline calls a team, roster, or injury
 * endpoint). The only feature is each player's current ranking — recent
 * form and head-to-head are documented gaps (see
 * `src/lib/tennis-win-probability-model.ts`), not silently dropped.
 *
 * Falls back to a coin flip if either player isn't found in the current
 * top-~150 rankings directory (same limitation `resolveAthletesStage`
 * already accepts), rather than fabricating a rank.
 */
export async function tennisAssembleFeaturesStage(
  predictionId: string,
  league: string,
  game: SportsGame,
  sportsApiBaseUrl: string,
): Promise<TennisFeatures> {
  const stageId = await startStage(predictionId, "assemble_features");

  try {
    const directory = await fetchAthleteDirectory(league, sportsApiBaseUrl);
    const findRank = (name: string) =>
      directory.find((a) => a.displayName.toLowerCase() === name.trim().toLowerCase())?.rank ?? null;

    const team1Rank = findRank(game.team1.name);
    const team2Rank = findRank(game.team2.name);

    const homeIsTeam1 = game.team1.isHome;
    const homeRank = homeIsTeam1 ? team1Rank : team2Rank;
    const awayRank = homeIsTeam1 ? team2Rank : team1Rank;

    const homeWinProbability =
      homeRank != null && awayRank != null
        ? computeTennisWinProbability({ rankDiff: awayRank - homeRank, recentFormDiff: 0 })
        : 0.5;
    const espnWinProbability = homeIsTeam1 ? homeWinProbability : 1 - homeWinProbability;

    const rawEspnData: Record<string, unknown> = {
      team1: { name: game.team1.name, rank: team1Rank },
      team2: { name: game.team2.name, rank: team2Rank },
    };

    await db
      .update(technicalAnalyses)
      .set({
        espnAnalytics: rawEspnData,
        espnWinProbability,
        espnModelVersion: TENNIS_MODEL_VERSION,
      })
      .where(eq(technicalAnalyses.predictionId, predictionId));

    await completeStage(stageId, "Tennis features assembled.", { espnWinProbability, team1Rank, team2Rank });
    return { espnWinProbability, espnModelVersion: TENNIS_MODEL_VERSION, rawEspnData };
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
