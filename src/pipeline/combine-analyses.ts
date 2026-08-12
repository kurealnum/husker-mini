import { combineAnalyses, type CombinerOutput } from "@/lib/openai/combiner";
import type { TechnicalAnalysis } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

export class InvalidCombinerOutputError extends Error {}

/** Validates a combiner response: probability must exist and fall within (0, 1). */
export function validateCombinerOutput(output: CombinerOutput): void {
  if (typeof output.probability !== "number" || Number.isNaN(output.probability)) {
    throw new InvalidCombinerOutputError("Combiner output is missing a numeric probability.");
  }
  if (output.probability <= 0 || output.probability >= 1) {
    throw new InvalidCombinerOutputError(
      `Combiner probability ${output.probability} is not within (0, 1).`,
    );
  }
}

/**
 * Sends the technical analysis to OpenAI and validates the structured
 * response: it must parse, include a `probability` field, and that
 * probability must fall strictly within (0, 1). Invalid output fails the
 * prediction rather than silently proceeding with a bad value.
 */
export async function combineAnalysesStage(
  predictionId: string,
  technicalAnalysis: TechnicalAnalysis,
  espnProbability: number,
): Promise<CombinerOutput> {
  const stageId = await startStage(predictionId, "combine_analyses");

  try {
    const output = await combineAnalyses({
      technicalProbability: technicalAnalysis.probability,
      technicalReasoning: technicalAnalysis.formulaInputs,
      espnProbability,
    });

    validateCombinerOutput(output);

    await completeStage(stageId, "Analyses combined.", { probability: output.probability });
    return output;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
