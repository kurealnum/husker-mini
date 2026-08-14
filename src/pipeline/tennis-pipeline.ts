import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { assertNotKilled, getActivePredictionConfigVersion } from "@/lib/config/prediction-config";
import { headToHead } from "@/lib/sports/provider";
import { TennisSportsProvider } from "@/lib/sports/tennis-provider";
import type { LeagueDefinition } from "@/lib/leagues/registry";
import { predictions, type Prediction } from "@/database/schemas";

import { calculateMarketEdgeStage } from "./calculate-market-edge";
import { calculateModelProbabilityStage } from "./calculate-model-probability";
import { combineAnalysesStage } from "./combine-analyses";
import { completePredictionStage } from "./complete-prediction";
import { executeOrderStage } from "./execute-order";
import { fetchKalshiEventStage } from "./fetch-kalshi-event";
import type { SportPipeline } from "./pipeline-contract";
import { resolveAthletesStage } from "./resolve-athletes";
import { completeStage, failStage, startStage } from "./stages";
import { technicalAnalysisStage } from "./technical-analysis";
import { tennisAssembleFeaturesStage } from "./tennis-assemble-features";

export class MissingGameDataError extends Error {}

/**
 * Pipeline for athlete (tennis) leagues: two players, head-to-head binary
 * market, set-based (not clocked) progress. The first non-team pipeline —
 * `resolve_teams` and `find_sports_game` are replaced with athlete-aware
 * equivalents, and `assemble_features` is replaced with a deliberately
 * thin ranking-only version (no team, roster, or injury endpoint exists to
 * build a fuller one from). `combine_analyses`, `calculate_model_probability`,
 * `calculate_market_edge`, `execute_order`, and `complete_prediction` are
 * reused unchanged — tennis is still a two-competitor, single-probability,
 * binary-market shape, just resolved differently.
 *
 * The combiner still runs (so its output is recorded for reference), but
 * every tennis config version is created with `combinerWeight: 0` — a
 * documented decision (see `docs/pipelines/tennis.md`), not an oversight:
 * the combiner's raw-data payload for tennis is just two rankings, too
 * thin for an independent LLM estimate to add anything over the ranking
 * model itself.
 *
 * ```mermaid
 * flowchart TD
 *   A[fetch_kalshi_event] --> B[resolve_athletes]
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
export const tennisPipeline: SportPipeline = {
  configFields: [
    { key: "technicalK", label: "Technical K", type: "number" },
    { key: "combinerModel", label: "OpenAI Model", type: "text" },
  ],

  async run(predictionId: string, prediction: Prediction, league: LeagueDefinition): Promise<void> {
    const configVersion = await getActivePredictionConfigVersion(league.key);
    assertNotKilled(configVersion);

    const kalshiResponse = await fetchKalshiEventStage(predictionId, prediction.kalshiEventTicker);

    const sportsApiBaseUrl = process.env.SPORTS_PROVIDER_API_BASE_URL!;
    const athletes = await resolveAthletesStage(predictionId, league.key, kalshiResponse.event.markets, sportsApiBaseUrl);

    const findGameStageId = await startStage(predictionId, "find_sports_game");
    const tennisProvider = new TennisSportsProvider(
      sportsApiBaseUrl || "https://site.api.espn.com/apis/site/v2/sports",
    );
    const contest = await tennisProvider.findGame({
      league: league.key,
      team1: athletes.athlete1,
      team2: athletes.athlete2,
    });
    if (!contest) {
      const message = `No sports data found for ${athletes.athlete1} vs ${athletes.athlete2}.`;
      await failStage(findGameStageId, message);
      throw new MissingGameDataError(message);
    }
    await completeStage(findGameStageId, "Match found.");
    const game = headToHead(contest);

    const technicalAnalysis = await technicalAnalysisStage(predictionId, configVersion.technicalK, game, league);

    const gameFeatures = await tennisAssembleFeaturesStage(predictionId, league.key, game, sportsApiBaseUrl);

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
