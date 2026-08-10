import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { getSportsProvider } from "@/lib/sports";
import { inferSportFromCategory } from "@/lib/sport-inference";
import { predictions } from "@/database/schemas";

import { calculateMarketEdgeStage } from "./calculate-market-edge";
import { calculateModelProbabilityStage } from "./calculate-model-probability";
import { combineAnalysesStage } from "./combine-analyses";
import { completePredictionStage } from "./complete-prediction";
import { fetchKalshiEventStage } from "./fetch-kalshi-event";
import { fetchNewsStage } from "./fetch-news";
import { resolveTeamsStage } from "./resolve-teams";
import { sentimentAnalysisStage } from "./sentiment-analysis";
import { completeStage, failStage, startStage } from "./stages";
import { technicalAnalysisStage } from "./technical-analysis";

export class MissingGameDataError extends Error {}

/**
 * Runs the complete prediction pipeline for a prediction, end to end.
 *
 * Every failure — from any stage, or from this orchestration itself — is
 * caught here, recorded on the prediction, and re-thrown. All data persisted
 * by earlier stages before the failure is left in place; the worker (which
 * calls this) is guaranteed the prediction never stays stuck in `running`.
 */
export async function runPrediction(predictionId: string): Promise<void> {
  try {
    const [prediction] = await db.select().from(predictions).where(eq(predictions.id, predictionId)).limit(1);
    if (!prediction) {
      throw new Error(`Prediction not found: ${predictionId}`);
    }

    const kalshiResponse = await fetchKalshiEventStage(predictionId, prediction.kalshiEventTicker);
    const sport = inferSportFromCategory(kalshiResponse.event.category);
    await db.update(predictions).set({ sport }).where(eq(predictions.id, predictionId));

    const sportsApiBaseUrl = process.env.SPORTS_PROVIDER_API_BASE_URL!;
    const teams = await resolveTeamsStage(predictionId, sport, kalshiResponse.event.title, sportsApiBaseUrl);

    const findGameStageId = await startStage(predictionId, "find_sports_game");
    const sportsProvider = getSportsProvider();
    const game = await sportsProvider.findGame({ sport, team1: teams.team1, team2: teams.team2 });
    if (!game) {
      const message = `No sports data found for ${teams.team1} vs ${teams.team2}.`;
      await failStage(findGameStageId, message);
      throw new MissingGameDataError(message);
    }
    await completeStage(findGameStageId, "Sports game found.");

    const technicalK = Number(process.env.PREDICTION_TECHNICAL_K);
    const technicalAnalysis = await technicalAnalysisStage(predictionId, technicalK, game);

    const articles = await fetchNewsStage(predictionId, teams.team1, teams.team2);
    const sentimentAnalysis = await sentimentAnalysisStage(predictionId, articles);

    const claudeOutput = await combineAnalysesStage(predictionId, technicalAnalysis, sentimentAnalysis);
    const modelOutput = await calculateModelProbabilityStage(
      predictionId,
      technicalAnalysis,
      sentimentAnalysis,
      claudeOutput,
    );

    const [withProbability] = await db
      .update(predictions)
      .set({ modelProbability: modelOutput.finalProbability })
      .where(eq(predictions.id, predictionId))
      .returning();

    await calculateMarketEdgeStage(predictionId, modelOutput.finalProbability, withProbability.marketPrice!);

    await completePredictionStage(predictionId, {
      kalshiResponse,
      sportsGame: game,
      newsData: { articleIds: articles.map((a) => a.id) },
      technicalModelVersion: technicalAnalysis.analysisVersion,
      sentimentModelVersion: sentimentAnalysis.sentimentModelVersion,
      combinerVersion: modelOutput.combinerModelVersion,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db
      .update(predictions)
      .set({ status: "failed", errorMessage: message })
      .where(eq(predictions.id, predictionId));
    throw error;
  }
}
