import { db } from "@/lib/db";
import { getStaticPredictionConfig } from "@/lib/config/prediction-config";
import type { CombinerOutput } from "@/lib/openai/combiner";
import { modelOutputs, type PredictionConfigVersion, type TechnicalAnalysis } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

const WEIGHT_VERSION = "1.0.0";

/**
 * Blends the pipeline's three phase probabilities — team scores/game
 * progress (technical), ESPN analysis, and the LLM combiner — into one final
 * probability, weighted by the active config version's per-phase weights.
 * Weights don't need to sum to 1; the blend normalizes by their sum.
 */
export async function calculateModelProbabilityStage(
  predictionId: string,
  technicalAnalysis: TechnicalAnalysis,
  espnProbability: number,
  claudeOutput: CombinerOutput,
  configVersion: PredictionConfigVersion,
) {
  const stageId = await startStage(predictionId, "calculate_model_probability");

  try {
    const { technicalWeight, espnWeight, combinerWeight } = configVersion;
    const { combinerModel } = getStaticPredictionConfig();
    const combinerProbability = claudeOutput.probability;

    const totalWeight = technicalWeight + espnWeight + combinerWeight;
    const finalProbability =
      totalWeight > 0
        ? (technicalWeight * technicalAnalysis.probability +
            espnWeight * espnProbability +
            combinerWeight * combinerProbability) /
          totalWeight
        : technicalAnalysis.probability;

    const [output] = await db
      .insert(modelOutputs)
      .values({
        predictionId,
        technicalProbability: technicalAnalysis.probability,
        technicalWeight,
        weightVersion: WEIGHT_VERSION,
        espnProbability,
        espnWeight,
        combinerProbability,
        combinerWeight,
        finalProbability,
        claudeOutput,
        combinerModelVersion: combinerModel,
      })
      .returning();

    await completeStage(stageId, "Model probability calculated.", { finalProbability });
    return output;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
