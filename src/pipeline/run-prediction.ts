import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { resolveLeagueFromTicker } from "@/lib/leagues/registry";
import { predictions } from "@/database/schemas";

import { headToHeadClockPipeline, MissingGameDataError } from "./head-to-head-clock-pipeline";
import type { SportPipeline } from "./pipeline-contract";

export { MissingGameDataError };

/**
 * Every league the pipeline can run today. Adding a league requires a
 * registry entry (src/lib/leagues/registry.ts) plus an entry here pointing at
 * its pipeline — nothing else in the codebase changes.
 */
const PIPELINES: Record<string, SportPipeline> = {
  nfl: headToHeadClockPipeline,
  ncaaf: headToHeadClockPipeline,
  nba: headToHeadClockPipeline,
  ncaab: headToHeadClockPipeline,
  nhl: headToHeadClockPipeline,
  mlb: headToHeadClockPipeline,
};

/** The pipeline registered for a league, or `undefined` if none is (e.g. a registry entry with no pipeline built yet). */
export function getPipelineForLeague(leagueKey: string): SportPipeline | undefined {
  return PIPELINES[leagueKey];
}

/**
 * Runs the complete prediction pipeline for a prediction, end to end.
 *
 * Resolves the league from the prediction's Kalshi ticker, looks up the
 * pipeline registered for it, and dispatches — this function contains no
 * sport-specific detail. Every failure — from any stage, from dispatch, or
 * from this orchestration itself — is caught here, recorded on the
 * prediction, and re-thrown. All data persisted by earlier stages before the
 * failure is left in place; the worker (which calls this) is guaranteed the
 * prediction never stays stuck in `running`.
 */
export async function runPrediction(predictionId: string): Promise<void> {
  const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId)).limit(1);
  if (!prediction) {
    throw new Error(`Prediction not found: ${predictionId}`);
  }

  try {
    const league = resolveLeagueFromTicker(prediction.kalshiEventTicker);
    const pipeline = PIPELINES[league.key];
    if (!pipeline) {
      throw new Error(`No pipeline registered for league: ${league.key}`);
    }

    await db.update(predictions).set({ league: league.key, sport: league.family }).where(eq(predictions.id, predictionId));

    await pipeline.run(predictionId, prediction, league);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db
      .update(predictions)
      .set({ status: "failed", errorMessage: message })
      .where(eq(predictions.id, predictionId));
    throw error;
  }
}
