import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { getPredictionConfig } from "@/lib/config/prediction-config";
import type { KalshiEventResponse } from "@/lib/kalshi/client";
import type { SportsGame } from "@/lib/sports/provider";
import { predictions, predictionSnapshots, predictionVersionMetadata } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

const PREDICTION_ENGINE_VERSION = "1.0.0";
const FEATURE_SET_VERSION = "1.0.0";

export interface CompletePredictionInputs {
  kalshiResponse: KalshiEventResponse;
  sportsGame: SportsGame;
  newsData: Record<string, unknown>;
  technicalModelVersion: string;
  sentimentModelVersion: string;
  combinerVersion: string;
}

/**
 * Finalizes a successful prediction: snapshots every external data source
 * used, records the exact versions/parameters involved, and transitions the
 * prediction from `predicted` to `waiting_for_result`. No money is exchanged
 * here — this only records the model's decision.
 */
export async function completePredictionStage(
  predictionId: string,
  inputs: CompletePredictionInputs,
) {
  const stageId = await startStage(predictionId, "complete_prediction");

  try {
    await db.insert(predictionSnapshots).values({
      predictionId,
      kalshiMarketData: inputs.kalshiResponse as unknown as Record<string, unknown>,
      sportsData: inputs.sportsGame as unknown as Record<string, unknown>,
      newsData: inputs.newsData,
    });

    await db.insert(predictionVersionMetadata).values({
      predictionId,
      predictionEngineVersion: PREDICTION_ENGINE_VERSION,
      technicalModelVersion: inputs.technicalModelVersion,
      sentimentModelVersion: inputs.sentimentModelVersion,
      combinerVersion: inputs.combinerVersion,
      featureSetVersion: FEATURE_SET_VERSION,
      modelParameters: { ...getPredictionConfig() },
    });

    const [predicted] = await db
      .update(predictions)
      .set({ status: "predicted", predictedAt: new Date() })
      .where(eq(predictions.id, predictionId))
      .returning();

    await completeStage(stageId, "Prediction completed.");

    const [waiting] = await db
      .update(predictions)
      .set({ status: "waiting_for_result" })
      .where(eq(predictions.id, predictionId))
      .returning();

    return waiting ?? predicted;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
