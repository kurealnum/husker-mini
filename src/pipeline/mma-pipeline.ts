import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { assertNotKilled, getActivePredictionConfigVersion } from "@/lib/config/prediction-config";
import { headToHead } from "@/lib/sports/provider";
import { MmaSportsProvider } from "@/lib/sports/mma-provider";
import type { LeagueDefinition } from "@/lib/leagues/registry";
import { predictions, type Prediction } from "@/database/schemas";

import { calculateMarketEdgeStage } from "./calculate-market-edge";
import { calculateModelProbabilityStage } from "./calculate-model-probability";
import { combineAnalysesStage } from "./combine-analyses";
import { completePredictionStage } from "./complete-prediction";
import { executeOrderStage } from "./execute-order";
import { fetchKalshiEventStage } from "./fetch-kalshi-event";
import { mmaAssembleFeaturesStage } from "./mma-assemble-features";
import type { SportPipeline } from "./pipeline-contract";
import { resolveFightersStage } from "./resolve-fighters";
import { completeStage, failStage, startStage } from "./stages";
import { technicalAnalysisStage } from "./technical-analysis";

export class MissingGameDataError extends Error {}

/**
 * Pipeline for MMA (UFC): two fighters, head-to-head binary market,
 * round-based progress, no running score. The thinnest data of any
 * league in this epic — no roster, injury, gamelog, athlete-stats,
 * rankings, or team endpoint exists (confirmed 404 across the board; see
 * `docs/pipelines/mma.md`), so `resolve_fighters` reads fighter names
 * straight off the Kalshi market (`yes_sub_title` is already the full
 * name — no ESPN lookup needed at all), and `assemble_features` is
 * limited to each fighter's career record parsed from the scoreboard
 * response itself.
 *
 * There is no live state to track (fights aren't scored incrementally the
 * way a points/goals differential is), so **every UFC config version is
 * created with `technicalWeight: 0`** — a documented decision, not an
 * oversight: `technical_analysis` still runs (for the stage log/audit
 * trail) but the shared ratio formula on a 0-0 pre-fight "score" always
 * returns a coin flip, and a zero weight means it never affects the
 * blend regardless. The prediction rests entirely on the record-based
 * ESPN-analysis-phase model (`combine_analyses`, `calculate_model_probability`,
 * `calculate_market_edge`, `execute_order`, and `complete_prediction` are
 * reused unchanged from the shared pipeline components).
 *
 * ```mermaid
 * flowchart TD
 *   A[fetch_kalshi_event] --> B[resolve_fighters]
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
export const mmaPipeline: SportPipeline = {
  configFields: [{ key: "combinerModel", label: "OpenAI Model", type: "text" }],

  async run(predictionId: string, prediction: Prediction, league: LeagueDefinition): Promise<void> {
    const configVersion = await getActivePredictionConfigVersion(league.key);
    assertNotKilled(configVersion);

    const kalshiResponse = await fetchKalshiEventStage(predictionId, prediction.kalshiEventTicker);

    const fighters = await resolveFightersStage(predictionId, kalshiResponse.event.markets);

    const findGameStageId = await startStage(predictionId, "find_sports_game");
    const sportsApiBaseUrl = process.env.SPORTS_PROVIDER_API_BASE_URL ?? "https://site.api.espn.com/apis/site/v2/sports";
    const mmaProvider = new MmaSportsProvider(sportsApiBaseUrl);
    const contest = await mmaProvider.findGame({
      league: league.key,
      team1: fighters.fighter1,
      team2: fighters.fighter2,
    });
    if (!contest) {
      const message = `No sports data found for ${fighters.fighter1} vs ${fighters.fighter2}.`;
      await failStage(findGameStageId, message);
      throw new MissingGameDataError(message);
    }
    await completeStage(findGameStageId, "Fight found.");
    const game = headToHead(contest);

    const technicalAnalysis = await technicalAnalysisStage(predictionId, configVersion.technicalK, game, league);

    const gameFeatures = await mmaAssembleFeaturesStage(predictionId, league.key, game, sportsApiBaseUrl);

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
