import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { assertNotKilled, getActivePredictionConfigVersion } from "@/lib/config/prediction-config";
import { getSportsProvider } from "@/lib/sports";
import { headToHead } from "@/lib/sports/provider";
import type { LeagueDefinition } from "@/lib/leagues/registry";
import { predictions, type Prediction } from "@/database/schemas";

import { assembleFeaturesStage } from "./assemble-features";
import { calculateMarketEdgeStage } from "./calculate-market-edge";
import { calculateModelProbabilityStage } from "./calculate-model-probability";
import { combineAnalysesStage } from "./combine-analyses";
import { completePredictionStage } from "./complete-prediction";
import { executeOrderStage } from "./execute-order";
import { fetchKalshiEventStage } from "./fetch-kalshi-event";
import type { SportPipeline } from "./pipeline-contract";
import { resolveTeamsStage } from "./resolve-teams";
import { completeStage, failStage, startStage } from "./stages";
import { technicalAnalysisStage } from "./technical-analysis";

export class MissingGameDataError extends Error {}

/**
 * Shared pipeline for every two-team, clocked, head-to-head league (NFL,
 * NCAAF, NBA, NCAAB, NHL, MLB today). All six currently share one
 * win-probability model, so one pipeline instance is registered for all of
 * them — a league gets its own pipeline only once its model work diverges.
 *
 * ```mermaid
 * flowchart TD
 *   A[fetch_kalshi_event] --> B[resolve_teams]
 *   B --> C[find_sports_game]
 *   C --> D[technical_analysis]
 *   C --> E[assemble_features]
 *   E --> F[combine_analyses]
 *   D --> G[calculate_model_probability]
 *   E --> G
 *   F --> G
 *   G --> H[calculate_market_edge]
 *   H --> I[execute_order]
 *   I --> J[complete_prediction]
 * ```
 */
export const headToHeadClockPipeline: SportPipeline = {
  configFields: [
    { key: "technicalK", label: "Technical K", type: "number" },
    { key: "combinerModel", label: "OpenAI Model", type: "text" },
  ],

  async run(predictionId: string, prediction: Prediction, league: LeagueDefinition): Promise<void> {
    // Checked before any stage runs: a killed league produces no partial
    // work, and this only ever affects this one league's config/predictions.
    const configVersion = await getActivePredictionConfigVersion(league.key);
    assertNotKilled(configVersion);

    const kalshiResponse = await fetchKalshiEventStage(predictionId, prediction.kalshiEventTicker);

    const sportsApiBaseUrl = process.env.SPORTS_PROVIDER_API_BASE_URL!;
    const teams = await resolveTeamsStage(predictionId, league.key, kalshiResponse.event.markets, sportsApiBaseUrl);

    const findGameStageId = await startStage(predictionId, "find_sports_game");
    const sportsProvider = getSportsProvider();
    const contest = await sportsProvider.findGame({ league: league.key, team1: teams.team1, team2: teams.team2 });
    if (!contest) {
      const message = `No sports data found for ${teams.team1} vs ${teams.team2}.`;
      await failStage(findGameStageId, message);
      throw new MissingGameDataError(message);
    }
    await completeStage(findGameStageId, "Sports game found.");
    const game = headToHead(contest);

    const technicalAnalysis = await technicalAnalysisStage(predictionId, configVersion.technicalK, game);

    const gameFeatures = await assembleFeaturesStage(predictionId, league.key, game);

    const claudeOutput = await combineAnalysesStage(
      predictionId,
      game,
      gameFeatures.rawEspnData,
      configVersion,
      league,
    );
    const modelOutput = await calculateModelProbabilityStage(
      predictionId,
      technicalAnalysis,
      gameFeatures.espnWinProbability,
      claudeOutput,
      configVersion,
    );

    const [withProbability] = await db
      .update(predictions)
      .set({ modelProbability: modelOutput.finalProbability })
      .where(eq(predictions.id, predictionId))
      .returning();

    if (withProbability.marketPrice == null) {
      throw new Error(`Prediction ${predictionId} has no market price; cannot calculate edge.`);
    }

    const withDecision = await calculateMarketEdgeStage(
      predictionId,
      modelOutput.finalProbability,
      withProbability.marketPrice,
      configVersion,
      league.key,
    );

    await executeOrderStage(predictionId, withDecision, configVersion);

    await completePredictionStage(predictionId, {
      kalshiResponse,
      sportsGame: game,
      technicalModelVersion: technicalAnalysis.analysisVersion,
      espnModelVersion: gameFeatures.espnModelVersion,
      combinerVersion: modelOutput.combinerModelVersion,
      configVersion,
      winProbabilityModelVersion: league.winProbabilityModelVersion,
    });
  },
};
