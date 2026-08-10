import { db } from "@/lib/db";
import type { SportsGame } from "@/lib/sports/provider";
import { computeTechnicalProbability } from "@/lib/technical-formula";
import { technicalAnalyses } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

const ANALYSIS_VERSION = "1.0.0";

/** Runs the technical formula against current game state and persists inputs/output. */
export async function technicalAnalysisStage(
  predictionId: string,
  k: number,
  game: SportsGame,
) {
  const stageId = await startStage(predictionId, "technical_analysis");

  try {
    const formulaInputs = { k, S: game.gameProgress, T1: game.team1.score, T2: game.team2.score };
    const probability = computeTechnicalProbability(
      k,
      game.gameProgress,
      game.team1.score,
      game.team2.score,
    );

    const [analysis] = await db
      .insert(technicalAnalyses)
      .values({
        predictionId,
        team1Score: game.team1.score,
        team2Score: game.team2.score,
        gameProgress: game.gameProgress,
        k,
        formulaInputs,
        probability,
        analysisVersion: ANALYSIS_VERSION,
      })
      .returning();

    await completeStage(stageId, "Technical analysis complete.", { probability });
    return analysis;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
