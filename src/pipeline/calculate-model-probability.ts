import { db } from "@/lib/db";
import { getPredictionConfig } from "@/lib/config/prediction-config";
import type { CombinerOutput } from "@/lib/claude/combiner";
import { modelOutputs, type SentimentAnalysis, type TechnicalAnalysis } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

const WEIGHT_VERSION = "1.0.0";

/**
 * Combines the technical and sentiment probabilities into a single model
 * probability using the configured weighted average, and persists every
 * component that went into it for reproducibility.
 */
export async function calculateModelProbabilityStage(
  predictionId: string,
  technicalAnalysis: TechnicalAnalysis,
  sentimentAnalysis: SentimentAnalysis,
  claudeOutput: CombinerOutput,
) {
  const stageId = await startStage(predictionId, "calculate_model_probability");

  try {
    const { technicalWeight, sentimentWeight, combinerModel } = getPredictionConfig();
    if (!Number.isFinite(technicalWeight) || !Number.isFinite(sentimentWeight)) {
      throw new Error("PREDICTION_TECHNICAL_WEIGHT and PREDICTION_SENTIMENT_WEIGHT must be configured.");
    }

    const finalProbability =
      (technicalWeight * technicalAnalysis.probability + sentimentWeight * sentimentAnalysis.probability) /
      (technicalWeight + sentimentWeight);

    const [output] = await db
      .insert(modelOutputs)
      .values({
        predictionId,
        technicalProbability: technicalAnalysis.probability,
        sentimentProbability: sentimentAnalysis.probability,
        technicalWeight,
        sentimentWeight,
        weightVersion: WEIGHT_VERSION,
        finalProbability,
        claudeOutput,
        combinerModelVersion: combinerModel || "unknown",
      })
      .returning();

    await completeStage(stageId, "Model probability calculated.", { finalProbability });
    return output;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
