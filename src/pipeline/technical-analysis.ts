import { db } from "@/lib/db";
import type { SportsGame } from "@/lib/sports/provider";
import type { LeagueDefinition } from "@/lib/leagues/registry";
import { computeTechnicalProbability } from "@/lib/technical-formula";
import { computeHockeyTechnicalProbability, HOCKEY_TECHNICAL_ANALYSIS_VERSION } from "@/lib/hockey-technical-formula";
import { technicalAnalyses } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

const ANALYSIS_VERSION = "1.0.0";

/**
 * Contest-state probability for a league: hockey gets its own
 * goal-difference-with-time-remaining formula (see
 * `computeHockeyTechnicalProbability`) since the shared score-ratio
 * formula saturates at hockey's low scores; every other family still uses
 * the original ratio formula.
 */
function computeLeagueTechnicalProbability(
  league: LeagueDefinition,
  k: number,
  S: number,
  T1: number,
  T2: number,
): { probability: number; analysisVersion: string } {
  if (league.family === "hockey") {
    return { probability: computeHockeyTechnicalProbability(k, S, T1, T2), analysisVersion: HOCKEY_TECHNICAL_ANALYSIS_VERSION };
  }
  return { probability: computeTechnicalProbability(k, S, T1, T2), analysisVersion: ANALYSIS_VERSION };
}

/** Runs the league's contest-state formula against current game state and persists inputs/output. */
export async function technicalAnalysisStage(
  predictionId: string,
  k: number,
  game: SportsGame,
  league: LeagueDefinition,
) {
  const stageId = await startStage(predictionId, "technical_analysis");

  try {
    const formulaInputs = { k, S: game.gameProgress, T1: game.team1.score, T2: game.team2.score };
    const { probability, analysisVersion } = computeLeagueTechnicalProbability(
      league,
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
        analysisVersion,
      })
      .returning();

    await completeStage(stageId, "Technical analysis complete.", { probability });
    return analysis;
  } catch (error) {
    await failStage(stageId, error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
