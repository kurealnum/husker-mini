import { db } from "@/lib/db";
import type { SportsGame } from "@/lib/sports/provider";
import type { LeagueDefinition } from "@/lib/leagues/registry";
import { computeTechnicalProbability } from "@/lib/technical-formula";
import { computeHockeyTechnicalProbability, HOCKEY_TECHNICAL_ANALYSIS_VERSION } from "@/lib/hockey-technical-formula";
import { computeSoccerTechnicalProbabilities, SOCCER_TECHNICAL_ANALYSIS_VERSION } from "@/lib/soccer-technical-formula";
import { computeTennisTechnicalProbability, TENNIS_TECHNICAL_ANALYSIS_VERSION } from "@/lib/tennis-technical-formula";
import { technicalAnalyses } from "@/database/schemas";

import { completeStage, failStage, startStage } from "./stages";

const ANALYSIS_VERSION = "1.0.0";

/**
 * Contest-state probability for a league. Hockey, soccer, and tennis each
 * get their own goal/set-difference-with-time-remaining formula since the
 * shared score-ratio formula saturates at their low scores; every other
 * family still uses the original ratio formula. Soccer's formula produces
 * three outcomes — `probability` here is just its team1-win component
 * (for display/audit consistency with every other league's
 * `technical_analyses.probability` column); the three-way pipeline
 * recomputes the full breakdown directly via
 * `computeSoccerTechnicalProbabilities` for the actual blend.
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
  if (league.family === "soccer") {
    const threeWay = computeSoccerTechnicalProbabilities(k, S, T1, T2);
    return { probability: threeWay.homeWinProbability, analysisVersion: SOCCER_TECHNICAL_ANALYSIS_VERSION };
  }
  if (league.family === "tennis") {
    return { probability: computeTennisTechnicalProbability(k, S, T1, T2), analysisVersion: TENNIS_TECHNICAL_ANALYSIS_VERSION };
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
