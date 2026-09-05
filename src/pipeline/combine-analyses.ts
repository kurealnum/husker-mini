import { combineAnalyses, type CombinerOutput } from "@/lib/openai/combiner";
import type { PredictionConfigVersion } from "@/database/schemas";
import type { SportsGame } from "@/lib/sports/provider";

import { completeStage, failStage, startStage } from "./stages";

export class InvalidCombinerOutputError extends Error {}

/**
 * Returns a made-up combiner output based only on the current score, for
 * local testing without an OpenAI call. Only used when `STUB_EXTERNAL_CALLS`
 * is set — `assertStubLiveTradingSafe` (called at worker startup) refuses to
 * start if that env var and `LIVE_TRADING_ENABLED` are both true, so this
 * can never back a real order.
 */
function stubCombinerOutput(team1Score: number, team2Score: number): CombinerOutput {
  return {
    probability: team1Score >= team2Score ? 0.55 : 0.45,
    reasoning: "Stubbed combiner output (STUB_EXTERNAL_CALLS=true).",
  };
}

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
): Promise<CombinerOutput> {
  const stageId = await startStage(predictionId, "combine_analyses");
  const stubbed = process.env.STUB_EXTERNAL_CALLS === "true";

  try {
    const output = stubbed
      ? stubCombinerOutput(game.team1.score, game.team2.score)
      : await combineAnalyses({
          gameProgress: game.gameProgress,
          team1Score: game.team1.score,
          team2Score: game.team2.score,
          rawEspnData,
          model: configVersion.combinerModel,
        });

    validateCombinerOutput(output);

    await completeStage(stageId, "Analyses combined.", { probability: output.probability, stubbed });
    return output;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
