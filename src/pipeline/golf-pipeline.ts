import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { assertNotKilled, getActivePredictionConfigVersion } from "@/lib/config/prediction-config";
import { GolfFieldProvider } from "@/lib/sports/golf-provider";
import { computeGolfFieldWinProbabilities, GOLF_MODEL_VERSION } from "@/lib/golf-win-probability-model";
import type { LeagueDefinition } from "@/lib/leagues/registry";
import type { SportsGame } from "@/lib/sports/provider";
import { predictions, type Prediction } from "@/database/schemas";

import { executeOrderStage } from "./execute-order";
import { completePredictionStage } from "./complete-prediction";
import { calculateFieldMarketEdgeStage } from "./golf/calculate-field-market-edge";
import { fetchFieldKalshiEventStage } from "./golf/fetch-field-kalshi-event";
import type { SportPipeline } from "./pipeline-contract";
import { completeStage, failStage, startStage } from "./stages";

export class MissingGameDataError extends Error {}

/**
 * Pipeline for field (golf) markets: an N-competitor tournament field
 * (~70-150 players), not two competitors — the only market shape in this
 * app where a probability is computed per player across the whole field
 * rather than for one side of a binary/three-way contest. None of the
 * shared two-competitor stages apply: `resolve_teams`/`resolve_athletes`
 * (there's nothing to resolve — one tournament event, whose full field
 * `GolfFieldProvider` already returns), `technical_analysis` (no
 * meaningful two-competitor "contest state" exists for an N-way field —
 * `technicalWeight` is 0 for every golf config version, a documented
 * decision, same pattern as MMA), and `combine_analyses` (the LLM
 * combiner takes exactly two competitors' scores — adapting it to reason
 * over ~150 players isn't practical or cost-effective; `combinerWeight`
 * is also 0 for golf). The field win-probability model is the entire
 * prediction. `execute_order` and `complete_prediction` are reused
 * unchanged once a single leg has been chosen — see
 * `calculateFieldMarketEdgeStage`'s doc comment for why betting stays
 * single-leg (and therefore uses ordinary single-bet Kelly sizing
 * correctly, rather than needing portfolio-level Kelly across the field).
 *
 * ```mermaid
 * flowchart TD
 *   A[fetch_kalshi_event] --> C[find_sports_game]
 *   C --> E[assemble_features]
 *   E --> G[calculate_model_probability]
 *   G --> H[calculate_market_edge]
 *   H --> I[execute_order]
 *   I --> J[complete_prediction]
 * ```
 */
export const golfFieldPipeline: SportPipeline = {
  configFields: [],

  async run(predictionId: string, prediction: Prediction, league: LeagueDefinition): Promise<void> {
    const configVersion = await getActivePredictionConfigVersion(league.key);
    assertNotKilled(configVersion);

    const { response: kalshiResponse, legs } = await fetchFieldKalshiEventStage(predictionId, prediction.kalshiEventTicker);

    const findGameStageId = await startStage(predictionId, "find_sports_game");
    const sportsApiBaseUrl = process.env.SPORTS_PROVIDER_API_BASE_URL ?? "https://site.api.espn.com/apis/site/v2/sports";
    const golfProvider = new GolfFieldProvider(sportsApiBaseUrl);
    const contest = await golfProvider.findGame({ league: league.key, team1: "", team2: "" });
    if (!contest || contest.competitors.length === 0) {
      const message = "No active tournament field found.";
      await failStage(findGameStageId, message);
      throw new MissingGameDataError(message);
    }
    await completeStage(findGameStageId, "Tournament field found.", { fieldSize: contest.competitors.length });

    const featuresStageId = await startStage(predictionId, "assemble_features");
    const probabilitiesById = computeGolfFieldWinProbabilities(
      contest.competitors.map((c) => ({ id: c.id ?? c.name, scoreRelativeToPar: c.score })),
    );
    const byName = new Map(
      contest.competitors.map((c) => [c.name, probabilitiesById.get(c.id ?? c.name) ?? 0] as const),
    );
    await completeStage(featuresStageId, "Field probabilities computed.", { fieldSize: contest.competitors.length });

    const withDecision = await calculateFieldMarketEdgeStage(predictionId, legs, byName, configVersion, league.key);

    await executeOrderStage(predictionId, withDecision, configVersion);

    await db
      .update(predictions)
      .set({ modelProbability: withDecision.modelProbability })
      .where(eq(predictions.id, predictionId));

    await completePredictionStage(predictionId, {
      kalshiResponse,
      // Field contests hold N competitors, not the shared two-competitor
      // shape — stored as opaque JSON in the snapshot regardless, so the
      // type cast here is safe (nothing reads it back as a two-competitor
      // SportsGame for golf).
      sportsGame: contest as unknown as SportsGame,
      technicalModelVersion: "none-field-market",
      espnModelVersion: GOLF_MODEL_VERSION,
      combinerVersion: configVersion.combinerModel,
      configVersion,
      winProbabilityModelVersion: league.winProbabilityModelVersion,
    });
  },
};
