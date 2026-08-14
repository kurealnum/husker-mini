import { combineAnalyses, type CombinerOutput } from "@/lib/openai/combiner";
import type { LeagueDefinition } from "@/lib/leagues/registry";
import type { PredictionConfigVersion } from "@/database/schemas";
import type { SportsGame } from "@/lib/sports/provider";

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
 * Sends the game's raw ESPN data and current score/progress to OpenAI and
 * validates the structured response: it must parse, include a
 * `probability` field, and that probability must fall strictly within
 * (0, 1). Invalid output fails the prediction rather than silently
 * proceeding with a bad value.
 */
export async function combineAnalysesStage(
  predictionId: string,
  game: SportsGame,
  rawEspnData: Record<string, unknown>,
  configVersion: PredictionConfigVersion,
  league: LeagueDefinition,
): Promise<CombinerOutput> {
  const stageId = await startStage(predictionId, "combine_analyses");

  try {
    const output = await combineAnalyses({
      gameProgress: game.gameProgress,
      competitors: [
        { label: "team1", score: game.team1.score },
        { label: "team2", score: game.team2.score },
      ],
      scoreDirection: league.scoreSemantics.higherWins ? "higher_wins" : "lower_wins",
      rawEspnData,
      model: configVersion.combinerModel,
      maxPayloadBytes: league.combinerPayloadBudgetBytes,
    });

    validateCombinerOutput(output);

    await completeStage(stageId, "Analyses combined.", { probability: output.probability });
    return output;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
