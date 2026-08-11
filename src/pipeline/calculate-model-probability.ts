import { db } from "@/lib/db";
import { getPredictionConfig } from "@/lib/config/prediction-config";
import type { CombinerOutput } from "@/lib/openai/combiner";
import { modelOutputs, type TechnicalAnalysis } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

const WEIGHT_VERSION = "1.0.0";

/**
 * Records the technical probability as the model probability, along with
 * the combiner's output, for reproducibility.
 */
export async function calculateModelProbabilityStage(
  predictionId: string,
  technicalAnalysis: TechnicalAnalysis,
  claudeOutput: CombinerOutput,
) {
  const stageId = await startStage(predictionId, "calculate_model_probability");

  try {
    const { technicalWeight, combinerModel } = getPredictionConfig();
    const finalProbability = technicalAnalysis.probability;

    const [output] = await db
      .insert(modelOutputs)
      .values({
        predictionId,
        technicalProbability: technicalAnalysis.probability,
        technicalWeight,
        weightVersion: WEIGHT_VERSION,
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
